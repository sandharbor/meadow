/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { loadTrackingRecords } from '../../../../shared/bundle-node/trackingRecords.js';
import { sourceFilePathToBundleNodeKey } from '../../../../shared/bundle-node/nodeKeys.js';
import { diagnoseOrphanConnection } from './orphanDiagnosis.js';
import { sourceMoveSimilarity, sourceTextProfile } from './sourceMoveSimilarity.js';
import { findGroupedSourceMoves } from './sourceMoveGroups.js';
import { sourceTraversalGraph } from './sourceTraversalGraph.js';
import { loadPendingSourceProposal } from './proposalStore.js';
import { checkSourceProposalUpdates } from './proposalCapture.js';
import { proposedSourceMoveResolutions } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { isPlainObject } from '../../../../../../../shared_code/utils/durableDocument.js';

import { bundleStartingSelections } from '../../../../../../../shared_code/utils/startingSelectionUtils.js';
import { registryProposal } from './sourceRegistryReview.js';
import { bundleSources, splitSourceGraphPath, sourceForNode } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import { equivalentSnapshotPath, sourceProposalContext } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import fs from 'node:fs';
import { lineChangeCounts } from '../../../../../../../shared_code/utils/lineChanges.js';
import { readSourceBlob, retainCandidateSourceTree, SourceCaptureChangedError } from '../../../../shared/source-snapshot/sourceGit.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { BundleNodeConfig, FileBundleNodeConfig, FolderBundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceMoveCandidate, SourceOrphanExplanation, SourceSnapshotAcceptance, SourceSnapshotAcceptanceResult, SourceSnapshotHistory, SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import {
  availableSnapshotGraph, missingSnapshotRoles, discoverSourceSnapshot, rememberReachableProvenance, captureSourceSnapshot, initializeSourcing, installAcceptedSnapshot, loadSourceBundleConfig,
  loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, sha256,
  snapshotDirectory, snapshotFilePath, snapshotGraph, snapshotSourceRoot, snapshotSummary,
  sourceConfigFingerprint, sourcePath, sourcingRoot, sourcingStatePath, SourcingError,
  verifySourceSnapshot, withSourcingLock, writeSourcingJson,
  type SourceSnapshot,
} from '../../../../shared/source-snapshot/sourceSnapshots.js';

export function findSourceMoves(bundleDirectory: string, previous: SourceSnapshot, current: SourceSnapshot, configs: BundleNodeConfig[]): SourceMoveCandidate[] {
  const configuredPaths = new Set(configs.map(node => snapshotFilePath(current, node)));
  // Existing unconfigured files also matter when importing a legacy tracked copy after a move.
  const newPaths = Object.keys(current.files).filter(filename => !configuredPaths.has(filename));
  const candidates: SourceMoveCandidate[] = [];
  const missingFiles: Array<{ node: FileBundleNodeConfig; oldPath: string; prior: SourceSnapshot['files'][string]; profile?: ReturnType<typeof sourceTextProfile> }> = [];
  const resultsByNode = new Map<string, Array<SourceMoveCandidate & { score: number }>>();
  for (const node of configs) {
    if (node.bundleNodeKind === 'folder') {
      const oldPath = snapshotFilePath(previous, node);
      if (!oldPath || current.directories.includes(snapshotFilePath(current, node))) continue;
      const signature = (snapshot: SourceSnapshot, directory: string) => Object.entries(snapshot.files)
        .filter(([filename]) => filename.startsWith(`${directory}/`))
        .map(([filename, file]) => `${filename.slice(directory.length + 1)}:${file.digest}`).sort().join('\n');
      const prior = signature(previous, oldPath);
      if (!prior) continue;
      const matches = current.directories.filter(directory => !previous.directories.includes(directory)
        && !configuredPaths.has(directory) && signature(current, directory) === prior);
      for (const newPath of matches.slice(0, 3)) candidates.push({
        bundleNodeId: node.bundleNodeId, oldPath, newPath, confidence: 'strong', competing: matches.length > 1,
        evidence: ['Identical folder contents and relative file paths'],
        similarity: sourceMoveSimilarity({ oldPath, newPath, exact: true, folder: true, previous, current }),
        previousRoute: previous.graph?.nodes.find(item => item.bundleNodeId === node.bundleNodeId)?.path ?? [],
        currentRoute: current.graph?.nodes.find(item => item.bundleNodeKey === `folder:${newPath}`)?.path ?? [],
      });
      continue;
    }
    if (node.bundleNodeKind !== 'file') continue;
    const oldPath = snapshotFilePath(previous, node);
    const prior = previous.files[oldPath];
    if (!prior || current.files[snapshotFilePath(current, node)]) continue;
    missingFiles.push({ node, oldPath, prior });
  }
  // Parse each candidate once, then compare it with the missing pages. Keeping only
  // the current candidate's blocks avoids retaining the entire source library.
  for (const newPath of newPaths) {
    let candidateProfile: ReturnType<typeof sourceTextProfile> | undefined;
    for (const missing of missingFiles) {
      const { node, oldPath, prior } = missing;
      // Empty contents provide no evidence that two pages share an identity.
      if (prior.size === 0 || current.files[newPath].size === 0) continue;
      if (path.extname(oldPath).toLowerCase() !== path.extname(newPath).toLowerCase()) continue;
      const exact = prior.digest === current.files[newPath].digest;
      if (/\.(md|html|txt)$/i.test(oldPath)) {
        missing.profile ??= sourceTextProfile(fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, previous.id, previous), oldPath), 'utf8'));
        candidateProfile ??= sourceTextProfile(fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, current.id, current), newPath), 'utf8'));
        if (!missing.profile.length || !candidateProfile.length) continue;
      }
      const similarity = sourceMoveSimilarity({ oldPath, newPath, exact, before: missing.profile, after: candidateProfile, previous, current });
      const content = similarity.criteria.find(criterion => criterion.id === (exact ? 'contents' : 'blocks'))!;
      if ((content.score ?? 0) < 0.45 || similarity.score < 0.5) continue;
      const evidence = similarity.criteria.filter(criterion => (criterion.score ?? 0) > 0 && criterion.weight > 0).map(criterion => criterion.detail);
      const score = similarity.score;
      const results = resultsByNode.get(node.bundleNodeId) ?? [];
      results.push({ bundleNodeId: node.bundleNodeId, oldPath, newPath, evidence, similarity,
        confidence: exact && content.score === 1 ? 'strong' : 'possible', competing: false, score,
        previousRoute: previous.graph?.nodes.find(item => item.bundleNodeKey === sourceFilePathToBundleNodeKey(oldPath))?.path ?? [],
        currentRoute: current.graph?.nodes.find(item => item.bundleNodeKey === sourceFilePathToBundleNodeKey(newPath))?.path ?? [] });
      resultsByNode.set(node.bundleNodeId, results);
    }
  }
  for (const { node } of missingFiles) {
    const results = resultsByNode.get(node.bundleNodeId) ?? [];
    results.sort((a, b) => b.score - a.score || a.newPath.localeCompare(b.newPath));
    for (const match of results.slice(0, 3)) {
      candidates.push({ bundleNodeId: match.bundleNodeId, oldPath: match.oldPath, newPath: match.newPath,
        evidence: match.evidence, similarity: match.similarity, confidence: match.confidence, competing: results.length > 1,
        previousRoute: match.previousRoute, currentRoute: match.currentRoute });
    }
  }
  for (const candidate of candidates) {
    if (candidates.some(other => other.bundleNodeId !== candidate.bundleNodeId && other.newPath === candidate.newPath)) candidate.competing = true;
  }
  candidates.push(...findGroupedSourceMoves(bundleDirectory, previous, current, configs, candidates));
  for (const candidate of candidates) {
    if (candidates.some(other => other.bundleNodeId !== candidate.bundleNodeId && other.newPath === candidate.newPath)) candidate.competing = true;
  }
  return candidates;
}

export function relinkSourceNode(node: FileBundleNodeConfig | FolderBundleNodeConfig, relative: string, sources?: BundleSource[]): FileBundleNodeConfig | FolderBundleNodeConfig {
  const locator = splitSourceGraphPath(relative, sources);
  relative = locator.relativePath;
  node = { ...node, ...(locator.sourceId && { sourceId: locator.sourceId }) };
  if (node.bundleNodeKind === 'folder') return { ...node, bundleNodeName: path.posix.basename(relative), sourceGraphSubdirectory: relative };
  const suffix = node.fileType === 'excalidraw' && relative.endsWith('.excalidraw.md') ? '.excalidraw.md' : `.${node.fileType === 'excalidraw' ? 'md' : node.fileType}`;
  if (!relative.endsWith(suffix)) throw new SourcingError('A move must preserve the source file type');
  return { ...node, bundleNodeName: path.posix.basename(relative).slice(0, -suffix.length),
    sourceGraphSubdirectory: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative) };
}

export function explainSourceOrphans(bundleDirectory: string, snapshot: SourceSnapshot, graph: SourceSnapshot['graph'], configs: BundleNodeConfig[], bundle = loadSourceBundleConfig(bundleDirectory), capturedOnly = false): SourceOrphanExplanation[] {
  if (!graph) return [];
  const records = loadTrackingRecords(bundleDirectory);
  const protectedIds = new Set([bundle.entryBundleNodeId, bundle.defaultTraversalBundleNodeId,
    ...configs.flatMap(node => node.bundleNodeKind === 'collection' ? node.memberBundleNodeIds : [])]);
  const results: SourceOrphanExplanation[] = [];
  const priorGraphs = new Map<string, SourceSnapshot['graph']>();
  for (const config of configs) {
    if (graph.nodes.some(node => node.bundleNodeId === config.bundleNodeId)) continue;
    const previous = records[config.bundleNodeId]?.lastReachable;
    const filename = snapshotFilePath(snapshot, config);
    let reason = 'This configuration is not reachable in the snapshot’s working graph.';
    let brokenConnection: SourceOrphanExplanation['brokenConnection'];
    let diagnosis: SourceOrphanExplanation['diagnosis'];
    const route = previous?.route ?? [];
    for (let index = route.length - 1; index > 0; index -= 1) {
      const from = route[index - 1];
      const to = route[index];
      const linked = graph.allOutlinkTargets[from]?.includes(to) || graph.allInlinkSources[from]?.includes(to)
        || graph.edges.some(edge => edge.source === from && edge.target === to);
      if (!linked) {
        brokenConnection = { from, to };
        if (previous && !priorGraphs.has(previous.snapshotId)) {
          priorGraphs.set(previous.snapshotId, loadSourceSnapshot(bundleDirectory, previous.snapshotId).graph);
        }
        diagnosis = diagnoseOrphanConnection(bundle.sourceDirectory,  previous ? priorGraphs.get(previous.snapshotId) : undefined, graph, from, to, bundle.sources, capturedOnly ? snapshot.sourceAvailability ?? {} : undefined);
        if (diagnosis?.kind === 'missing-file') reason = diagnosis.from
          ? `${diagnosis.from} links to ${diagnosis.to}, but that file does not exist in the filesystem.`
          : `${diagnosis.to} does not exist in the filesystem.`;
        else if (diagnosis?.kind === 'removed-link') reason = `${diagnosis.from} no longer links to ${diagnosis.to}.`;
        else if (diagnosis?.kind === 'outside-graph') reason = `${diagnosis.to} exists in the filesystem, but is not reachable in this snapshot’s working graph.`;
        else reason = 'The previous route is not reachable in this snapshot. The source connection could not be verified.';
        break;
      }
    }
    if (config.bundleNodeKind !== 'collection' && !sourceForNode(bundle, config)) reason = 'This source is being removed from the bundle. Its files are untouched.';
    results.push({ title: config.bundleNodeName, directory: config.sourceGraphSubdirectory ?? '', fileType: config.fileType ?? config.bundleNodeKind,
      ...(protectedIds.has(config.bundleNodeId) && { removalBlockedReason: 'This entry is required by the bundle’s traversal or selected folders. Repair its source or change the bundle settings first.' }),
      bundleNodeId: config.bundleNodeId, path: filename, previousPath: route, reason, ...(brokenConnection && { brokenConnection }), ...(diagnosis && { diagnosis }) });
  }
  return results;
}

export async function sourcingReview(bundleDirectory: string): Promise<SourcingReview> {
  await initializeSourcing(bundleDirectory);
  return await withSourcingLock(bundleDirectory, () => buildSourceReview(bundleDirectory));
}

async function buildSourceReview(bundleDirectory: string, attempt = 0): Promise<SourcingReview> {
  const state = loadSourcingState(bundleDirectory)!;
  const fingerprint = sourceConfigFingerprint(bundleDirectory);
  const accepted = loadSourceSnapshot(bundleDirectory, state.acceptedId);
  const configs = loadSourceNodeConfigs(bundleDirectory);
  const graph = await availableSnapshotGraph(bundleDirectory, accepted, 0);
  if (graph) rememberReachableProvenance(bundleDirectory, accepted, graph, configs);
  const candidate = state.candidateId ? loadSourceSnapshot(bundleDirectory, state.candidateId) : undefined;
  const context = sourceProposalContext(loadSourceBundleConfig(bundleDirectory), configs, candidate);
  const candidateGraph = candidate ? await availableSnapshotGraph(bundleDirectory, candidate, 0, context) : graph;
  const moves = candidate ? findSourceMoves(bundleDirectory, { ...accepted, graph }, { ...candidate, graph: candidateGraph }, configs).map(move => ({
    ...move, contentChanged: Boolean(accepted.files[move.oldPath] && candidate.files[move.newPath]
      && accepted.files[move.oldPath].digest !== candidate.files[move.newPath].digest),
  })) : [];
  const pairedOld = new Set(moves.map(move => move.oldPath));
  const pairedNew = new Set(moves.map(move => move.newPath));
  const pairedIds = new Set(moves.map(move => move.bundleNodeId));
  const byPath = new Map(configs.map(node => [snapshotFilePath(accepted, node), node.bundleNodeId]));
  const changes: SourcingReview['changes'] = [];
  if (candidate) {
    for (const [filename, file] of Object.entries(accepted.files)) {
      if (pairedOld.has(filename)) continue;
      const currentPath = equivalentSnapshotPath(accepted, candidate, filename);
      if (!candidate.files[currentPath]) changes.push({ kind: 'missing', path: filename, bundleNodeId: byPath.get(filename) });
      else if (file.digest !== candidate.files[currentPath].digest) changes.push({ kind: 'modified', path: currentPath, ...(currentPath !== filename && { previousPath: filename }), bundleNodeId: byPath.get(filename) });
    }
    for (const filename of Object.keys(candidate.files)) {
      if (!accepted.files[equivalentSnapshotPath(candidate, accepted, filename)] && !pairedNew.has(filename)) changes.push({ kind: 'added', path: filename, route: candidateGraph?.nodes.find(node => node.bundleNodeKey === sourceFilePathToBundleNodeKey(filename))?.path ?? [] });
    }
  }
  if (sourceConfigFingerprint(bundleDirectory) !== fingerprint && attempt < 2) return await buildSourceReview(bundleDirectory, attempt + 1);
  // Classify identities only after individual and grouped moves are assembled.
  // Both locators belong to that review item, including aliases in legacy config.
  const orphans = explainSourceOrphans(bundleDirectory, candidate ?? accepted, candidateGraph, context.nodes, context.config)
    .filter(orphan => !pairedIds.has(orphan.bundleNodeId) && !pairedOld.has(orphan.path) && !pairedNew.has(orphan.path));
  const orphanPaths = new Set(orphans.map(orphan => orphan.path));
  const distinctChanges = changes.filter(change => change.kind !== 'missing' || !orphanPaths.has(change.path));
  return {
    traversalGraphs: {
      accepted: sourceTraversalGraph(accepted.id, graph, moves.map(move => move.previousRoute), accepted.sources),
      ...(candidate && { candidate: sourceTraversalGraph(candidate.id, candidateGraph,
        [...moves.map(move => move.currentRoute), ...distinctChanges.map(change => change.route ?? [])], candidate.sources) }),
    },
    ...(candidate?.sourceProposal && { sourceChanges: {
      before: bundleSources(loadSourceBundleConfig(bundleDirectory)), after: candidate.sourceProposal.sources,
      startingSelectionsChanged: candidate.sourceProposal.startingSelectionsChanged,
      stale: candidate.sourceProposal.baseConfigFingerprint !== fingerprint,
      outputPathsChange: candidate.sourceProposal.sourceOutputLayout !== loadSourceBundleConfig(bundleDirectory).sourceOutputLayout
        || candidate.sourceProposal.sources.some(source => bundleSources(loadSourceBundleConfig(bundleDirectory)).some(before => before.id === source.id && before.name !== source.name)),
    } }),
    accepted: state.history.find(item => item.id === accepted.id) ?? snapshotSummary(accepted),
    ...(candidate && { candidate: snapshotSummary(candidate) }), moves, changes: distinctChanges,
    orphans, history: state.history,
    ...(loadPendingSourceProposal(bundleDirectory) && { pendingProposal: true }),
    reviewToken: sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${fingerprint}`),
  };
}

export async function scanSourceChanges(bundleDirectory: string, replaceCandidate = false, rebuildIndex = false): Promise<SourcingReview> {
  await initializeSourcing(bundleDirectory);
  if (loadPendingSourceProposal(bundleDirectory)) {
    await checkSourceProposalUpdates(bundleDirectory, rebuildIndex);
    return sourcingReview(bundleDirectory);
  }
  await withSourcingLock(bundleDirectory, async () => {
    const state = loadSourcingState(bundleDirectory)!;
    if (state.candidateId && !replaceCandidate && !rebuildIndex) return;
    const pending = state.candidateId ? loadSourceSnapshot(bundleDirectory, state.candidateId) : undefined;
    const proposal = pending?.sourceProposal ? registryProposal(bundleDirectory, pending.sourceProposal.sources, pending.sourceProposal.startingSelectionsChanged ? bundleStartingSelections(pending.sourceProposal, pending.sourceProposal.nodes) : undefined, pending.sourceProposal.startingSelectionsChanged ? pending.sourceProposal : undefined) : undefined;
    const context = sourceProposalContext(loadSourceBundleConfig(bundleDirectory), loadSourceNodeConfigs(bundleDirectory), proposal ? { sourceProposal: proposal } as SourceSnapshot : undefined);
    let discovery = await discoverSourceSnapshot(bundleDirectory, rebuildIndex, context);
    const comparisonId = state.candidateId ?? state.acceptedId;
    if (discovery.digest === loadSourceSnapshot(bundleDirectory, comparisonId).digest && (!proposal || pending?.sourceProposal?.baseConfigFingerprint === proposal.baseConfigFingerprint)) return;
    let captured: SourceSnapshot | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { captured = await captureSourceSnapshot(bundleDirectory, { discovery, context }); break; }
      catch (error) {
        if (!(error instanceof SourceCaptureChangedError)) throw error;
        if (attempt === 2) throw new SourcingError('Sources are still changing. The accepted snapshot and previous candidate have been kept; try refreshing again.');
        discovery = await discoverSourceSnapshot(bundleDirectory, false, context);
      }
    }
    if (!captured) throw new SourcingError('Source capture did not complete.');
    if (proposal) {
      captured.sourceProposal = proposal;
      writeSourcingJson(path.join(snapshotDirectory(bundleDirectory, captured.id), 'snapshot.json'), captured);
    }
    const previousCandidate = state.candidateId;
    if (!proposal && captured.digest === loadSourceSnapshot(bundleDirectory, state.acceptedId).digest) {
      delete state.candidateId;
      const accepted = loadSourceSnapshot(bundleDirectory, state.acceptedId);
      if (accepted.git) retainCandidateSourceTree(accepted.git);
      fs.rmSync(snapshotDirectory(bundleDirectory, captured.id), { recursive: true });
    } else state.candidateId = captured.id;
    writeSourcingJson(sourcingStatePath(bundleDirectory), state);
    if (previousCandidate) fs.rmSync(snapshotDirectory(bundleDirectory, previousCandidate), { recursive: true, force: true });
  });
  return await sourcingReview(bundleDirectory);
}

export async function acceptSourceSnapshot(bundleDirectory: string, request: SourceSnapshotAcceptance): Promise<SourceSnapshotAcceptanceResult> {
  if (loadPendingSourceProposal(bundleDirectory)) throw new SourcingError('Accept this update in the sourcing workspace so its pending decisions are included.');
  // Build the review before taking the write lock; acceptance checks its revision again inside it.
  const review = await sourcingReview(bundleDirectory);
  await withSourcingLock(bundleDirectory, async () => {
    const state = loadSourcingState(bundleDirectory)!;
    const token = sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${sourceConfigFingerprint(bundleDirectory)}`);
    if (request.reviewToken !== token || review.reviewToken !== token) throw new SourcingError('This review is stale. Reopen source review before applying.');
    const reviewedSnapshotId = state.candidateId ?? state.acceptedId;
    if (reviewedSnapshotId !== request.candidateId) {
      throw new SourcingError(`Snapshot '${request.candidateId}' does not match the reviewed snapshot '${reviewedSnapshotId}'. Copy the snapshot ID and review token exactly from source review before applying.`);
    }
    if (fs.existsSync(path.join(bundleDirectory, 'config/draft_bundle_node_config.yaml'))) throw new SourcingError('Save or undo curation changes before accepting a source update.');
    const removals = new Set(request.orphanRemovals ?? []);
    for (const id of removals) {
      const orphan = review.orphans.find(item => item.bundleNodeId === id);
      if (!orphan || orphan.removalBlockedReason) throw new SourcingError('Only removable orphaned entries in this review can be removed.', 400);
    }
    const candidate = loadSourceSnapshot(bundleDirectory, request.candidateId);
    verifySourceSnapshot(bundleDirectory, candidate);
    const proposal = state.candidateId ? candidate.sourceProposal : undefined;
    if (proposal && JSON.stringify(proposal.sources) !== JSON.stringify(candidate.sources)) throw new SourcingError('The proposed registry does not match its captured source snapshot. Refresh Source changes.');
    if (proposal && proposal.baseConfigFingerprint !== sourceConfigFingerprint(bundleDirectory)) throw new SourcingError('This source proposal is stale. Refresh Source changes before applying it.');
    const { config: bundle, nodes: configs } = sourceProposalContext(loadSourceBundleConfig(bundleDirectory), loadSourceNodeConfigs(bundleDirectory), proposal ? candidate : undefined);
    const candidateIds = new Set(review.moves.map(move => move.bundleNodeId));
    for (const id of Object.keys(request.resolutions)) if (!candidateIds.has(id)) throw new SourcingError('Unexpected source move resolution', 400);
    const resolutions = proposedSourceMoveResolutions(review.moves, request.resolutions);
    if ([...candidateIds].some(id => !Object.prototype.hasOwnProperty.call(resolutions, id))) {
      throw new SourcingError('Choose how to resolve competing source moves before accepting.', 400);
    }
    const destinations = new Set<string>();
    const relinked = configs.map(node => {
      if (!candidateIds.has(node.bundleNodeId)) return node;
      const destination = resolutions[node.bundleNodeId];
      if (destination === null) return node;
      if (typeof destination !== 'string' || node.bundleNodeKind === 'collection' || !review.moves.some(move => move.bundleNodeId === node.bundleNodeId && move.newPath === destination)) throw new SourcingError('Invalid source move choice', 400);
      if (destinations.has(destination)) throw new SourcingError('Two configured pages cannot be assigned to the same source file.');
      destinations.add(destination);
      return relinkSourceNode(node, destination, candidate.sources);
    });
    if (missingSnapshotRoles(candidate, bundle, relinked).length) throw new SourcingError('The bundle entry, traversal source, or selected folder is missing. Resolve its move before accepting this snapshot.');
    const relinkedGraph = await snapshotGraph(bundleDirectory, candidate, relinked, 0, false, bundle);
    const stillOrphaned = new Set(explainSourceOrphans(bundleDirectory, candidate, relinkedGraph, relinked, bundle).filter(item => !item.removalBlockedReason).map(item => item.bundleNodeId));
    // Resolved identity can restore reachability. All remaining unreachable entries
    // are cleaned together; an explicit legacy removal list cannot preserve others.
    for (const id of stillOrphaned) removals.add(id);
    if (!state.candidateId && !removals.size) throw new SourcingError('No orphan removals or source update to apply.');
    for (const id of removals) if (!stillOrphaned.has(id)) throw new SourcingError('A selected entry is reachable after the chosen moves. Keep it and review the update again.');
    const next = relinked.filter(node => !removals.has(node.bundleNodeId));
    const graph = removals.size ? await snapshotGraph(bundleDirectory, candidate, next, 0, false, bundle) : relinkedGraph;
    if (token !== sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${sourceConfigFingerprint(bundleDirectory)}`)) throw new SourcingError('Curation changed while applying. Review the source update again.');
    const acceptedAt = new Date().toISOString();
    installAcceptedSnapshot(bundleDirectory, state, {
      version: 1, storage: "git", acceptedId: candidate.id, history: state.candidateId ? [...state.history, snapshotSummary(candidate, acceptedAt)] : state.history,
    }, next, proposal);
    rememberReachableProvenance(bundleDirectory, candidate, graph, next);
    writeSourcingJson(path.join(sourcingRoot(bundleDirectory), state.candidateId ? `acceptance-${candidate.id}.json` : `orphan-cleanup-${randomUUID()}.json`), {
      snapshotId: candidate.id, acceptedAt, previousSnapshotId: state.acceptedId, resolutions, orphanRemovals: [...removals],
    });
    await commitChangesNative([path.join(bundleDirectory, 'config'), sourcingRoot(bundleDirectory)],
      `accept source snapshot for ${path.basename(bundleDirectory)}`, { configDir: getConfigDirectory() });
  });
  return await sourcingReview(bundleDirectory);
}

export function sourceComparison(bundleDirectory: string, beforeId: string, afterId: string, beforePath: string, afterPath: string): {
  before: string | null; after: string | null; binary: boolean; beforeImage?: boolean; afterImage?: boolean;
} {
  const state = loadSourcingState(bundleDirectory);
  const allowed = new Set([...(state?.history.map(item => item.id) ?? []), state?.candidateId]);
  if (!allowed.has(beforeId) || !allowed.has(afterId)) throw new SourcingError('Snapshot is not available in this bundle', 404);
  return snapshotComparison(bundleDirectory, loadSourceSnapshot(bundleDirectory, beforeId), loadSourceSnapshot(bundleDirectory, afterId), beforePath, afterPath);
}

const tooLargeForComparison = '[File is too large for the inline comparison]';

/** Captured content of one file in two loaded snapshots; images and other binary files carry no text. */
export function snapshotComparison(bundleDirectory: string, before: SourceSnapshot, after: SourceSnapshot, beforePath: string, afterPath: string): ReturnType<typeof sourceComparison> {
  const read = (snapshot: SourceSnapshot, relative: string) => {
    if (!snapshot.files[relative]) return null;
    if (snapshot.files[relative].size > 1024 * 1024) return tooLargeForComparison;
    return snapshot.git ? readSourceBlob(snapshot.git, relative).toString('utf8') : fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, snapshot.id), relative), 'utf8');
  };
  if (sourceImageType(afterPath || beforePath)) return {
    before: null, after: null, binary: true,
    beforeImage: Boolean(before.files[beforePath]),
    afterImage: Boolean(after.files[afterPath]),
  };
  const binary = !/\.(md|txt|html|svg|css|js|json|yaml)$/i.test(afterPath || beforePath);
  return binary ? { before: null, after: null, binary } : { before: read(before, beforePath), after: read(after, afterPath), binary };
}

/**
 * Line counts as the content comparison shows them, or null when there is no inline text diff.
 * A departing page counts only its previous content as removed. `hasPreviousContent` says whether
 * there is anything to show for it.
 */
export function snapshotLineCounts(bundleDirectory: string, before: SourceSnapshot, after: SourceSnapshot, beforePath: string, afterPath: string, departing: boolean) {
  const content = snapshotComparison(bundleDirectory, before, after, beforePath, afterPath);
  const next = departing ? null : content.after;
  const lineCounts = content.binary || [content.before, next].includes(tooLargeForComparison) ? null : lineChangeCounts(content.before, next);
  const hasPreviousContent = content.binary ? content.beforeImage ?? Boolean(before.files[beforePath]) : Boolean(content.before?.trim());
  return { lineCounts, hasPreviousContent };
}

import type { ParticipatesIn, sourceSnapshot } from '../../../../../../../concepts/index.js';
export type SourceAcceptanceMeadowConceptParticipations = [ParticipatesIn<typeof sourceSnapshot, "accept", typeof acceptSourceSnapshot>];

function sourceImageType(filename: string): string | undefined {
  const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp' };
  return types[path.extname(filename).toLowerCase()];
}

/** Read an admitted file from retained history, never from the live source directory. */
export function sourceSnapshotContent(bundleDirectory: string, id: string, relative: string) {
  const state = loadSourcingState(bundleDirectory);
  if (!state || (state.candidateId !== id && !state.history.some(item => item.id === id))) throw new SourcingError('Snapshot is not available in this bundle', 404);
  const snapshot = loadSourceSnapshot(bundleDirectory, id);
  if (!Object.prototype.hasOwnProperty.call(snapshot.files, relative)) throw new SourcingError('File is not available in this snapshot', 404);
  const bytes = snapshot.git ? readSourceBlob(snapshot.git, relative) : fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, id), relative));
  return { type: sourceImageType(relative) ?? 'text/plain; charset=utf-8', bytes };
}

export function sourceSnapshotImage(bundleDirectory: string, id: string, relative: string) {
  if (!sourceImageType(relative)) throw new SourcingError('Image is not available in this snapshot', 404);
  return sourceSnapshotContent(bundleDirectory, id, relative);
}

export function sourceSnapshotHistory(bundleDirectory: string): SourceSnapshotHistory {
  const state = loadSourcingState(bundleDirectory);
  const filename = path.join(sourcingRoot(bundleDirectory), 'acceptance-history.json');
  const acceptances: unknown = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : [];
  if (!Array.isArray(acceptances) || acceptances.some((value: unknown) => !isPlainObject(value)
    || typeof value.proposalId !== 'string' || typeof value.snapshotId !== 'string' || typeof value.acceptedAt !== 'string'
    || !Array.isArray(value.identities) || value.identities.some((identity: unknown) => !isPlainObject(identity)
      || typeof identity.bundleNodeId !== 'string' || typeof identity.previousPath !== 'string'
      || (identity.proposedPath !== null && typeof identity.proposedPath !== 'string')))) {
    throw new SourcingError('Invalid accepted identity history');
  }
  return { acceptedId: state?.acceptedId ?? null, snapshots: state?.history ?? [],
    ...(acceptances.length > 0 && { acceptances: acceptances as SourceSnapshotHistory['acceptances'] }) };
}
