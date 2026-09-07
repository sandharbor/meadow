/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { loadTrackingRecords } from '../../../../shared/bundle-node/trackingRecords.js';
import { findGroupedSourceMoves } from './sourceMoveGroups.js';
import { proposedSourceMoveResolutions } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { BundleNodeConfig, FileBundleNodeConfig, FolderBundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceMoveCandidate, SourceOrphanExplanation, SourceSnapshotAcceptance, SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import {
  availableSnapshotGraph, missingSnapshotRoles, liveSourceDigest, rememberReachableProvenance, captureSourceSnapshot, initializeSourcing, installAcceptedSnapshot, loadSourceBundleConfig,
  loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, sha256,
  snapshotDirectory, snapshotFilePath, snapshotGraph, snapshotSourceRoot, snapshotSummary,
  sourceConfigFingerprint, sourcePath, sourcingRoot, sourcingStatePath, SourcingError,
  verifySourceSnapshot, withSourcingLock, writeSourcingJson,
  type SourceSnapshot,
} from '../../../../shared/source-snapshot/sourceSnapshots.js';

function blocks(contents: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const block of contents.split(/\n\s*\n/)) {
    const normalized = block.replace(/\s+/g, ' ').trim();
    if (normalized.length >= 20) result.set(sha256(normalized), normalized.length);
  }
  return result;
}

function contentSimilarity(a: Map<string, number>, b: Map<string, number>): { similarity: number; unchanged: number; total: number } {
  const shared = [...a].filter(([hash]) => b.has(hash));
  const weight = (values: Map<string, number>) => [...values.values()].reduce((sum, size) => sum + size, 0);
  const denominator = Math.max(weight(a), weight(b));
  return { similarity: denominator ? shared.reduce((sum, [, size]) => sum + size, 0) / denominator : 0,
    unchanged: shared.length, total: a.size };
}

function nameSimilarity(left: string, right: string): number {
  const tokens = (value: string) => new Set(path.basename(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const a = tokens(left);
  const b = tokens(right);
  return [...a].filter(token => b.has(token)).length / Math.max(a.size, b.size, 1);
}

function sameLinks(a: string[] | undefined, b: string[] | undefined): boolean {
  return Boolean(a?.length && b?.length && [...a].sort().join('\0') === [...b].sort().join('\0'));
}

export function findSourceMoves(bundleDirectory: string, previous: SourceSnapshot, current: SourceSnapshot, configs: BundleNodeConfig[]): SourceMoveCandidate[] {
  const configuredPaths = new Set(configs.map(node => snapshotFilePath(current, node)));
  // Existing unconfigured files also matter when importing a legacy tracked copy after a move.
  const newPaths = Object.keys(current.files).filter(filename => !configuredPaths.has(filename));
  const candidates: SourceMoveCandidate[] = [];
  const missingFiles: Array<{ node: FileBundleNodeConfig; oldPath: string; prior: SourceSnapshot['files'][string]; blocks?: Map<string, number> }> = [];
  const resultsByNode = new Map<string, Array<SourceMoveCandidate & { score: number }>>();
  for (const node of configs) {
    if (node.bundleNodeKind === 'folder') {
      const oldPath = node.sourceGraphSubdirectory;
      if (!oldPath || current.directories.includes(oldPath)) continue;
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
    let candidateBlocks: Map<string, number> | undefined;
    for (const missing of missingFiles) {
      const { node, oldPath, prior } = missing;
      if (path.extname(oldPath).toLowerCase() !== path.extname(newPath).toLowerCase()) continue;
      const exact = prior.digest === current.files[newPath].digest;
      const evidence: string[] = [];
      let overlap = 0;
      if (exact) { overlap = 1; evidence.push('Identical file contents'); }
      else if (/\.(md|html|txt)$/i.test(oldPath)) {
        missing.blocks ??= blocks(fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, previous.id), oldPath), 'utf8'));
        candidateBlocks ??= blocks(fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, current.id), newPath), 'utf8'));
        const similarity = contentSimilarity(missing.blocks, candidateBlocks);
        overlap = similarity.similarity;
        if (similarity.unchanged) evidence.push(`${similarity.unchanged} of ${similarity.total} substantial blocks unchanged`);
      }
      if (overlap < 0.45) continue;
      const name = nameSimilarity(oldPath, newPath);
      if (path.basename(oldPath) === path.basename(newPath)) evidence.push('Same filename');
      else if (name >= 0.5) evidence.push('Similar filename');
      let context = 0;
      if (sameLinks(previous.graph?.allInlinkSources[oldPath], current.graph?.allInlinkSources[newPath])) {
        evidence.push('Same incoming links'); context += 0.5;
      }
      if (sameLinks(previous.graph?.allOutlinkTargets[oldPath], current.graph?.allOutlinkTargets[newPath])) {
        evidence.push('Same outgoing links'); context += 0.5;
      }
      const score = overlap * 0.75 + name * 0.15 + context * 0.1;
      if (score < 0.5) continue;
      const results = resultsByNode.get(node.bundleNodeId) ?? [];
      results.push({ bundleNodeId: node.bundleNodeId, oldPath, newPath, evidence,
        confidence: exact ? 'strong' : 'possible', competing: false, score,
        previousRoute: previous.graph?.nodes.find(item => item.bundleNodeKey === oldPath)?.path ?? [],
        currentRoute: current.graph?.nodes.find(item => item.bundleNodeKey === newPath)?.path ?? [] });
      resultsByNode.set(node.bundleNodeId, results);
    }
  }
  for (const { node } of missingFiles) {
    const results = resultsByNode.get(node.bundleNodeId) ?? [];
    results.sort((a, b) => b.score - a.score || a.newPath.localeCompare(b.newPath));
    for (const match of results.slice(0, 3)) {
      candidates.push({ bundleNodeId: match.bundleNodeId, oldPath: match.oldPath, newPath: match.newPath,
        evidence: match.evidence, confidence: match.confidence, competing: results.length > 1,
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

export function relinkSourceNode(node: FileBundleNodeConfig | FolderBundleNodeConfig, relative: string): FileBundleNodeConfig | FolderBundleNodeConfig {
  if (node.bundleNodeKind === 'folder') return { ...node, bundleNodeName: path.posix.basename(relative), sourceGraphSubdirectory: relative };
  const suffix = node.fileType === 'excalidraw' && relative.endsWith('.excalidraw.md') ? '.excalidraw.md' : `.${node.fileType === 'excalidraw' ? 'md' : node.fileType}`;
  if (!relative.endsWith(suffix)) throw new SourcingError('A move must preserve the source file type');
  return { ...node, bundleNodeName: path.posix.basename(relative).slice(0, -suffix.length),
    sourceGraphSubdirectory: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative) };
}

export function explainSourceOrphans(bundleDirectory: string, snapshot: SourceSnapshot, graph: SourceSnapshot['graph'], configs: BundleNodeConfig[]): SourceOrphanExplanation[] {
  if (!graph) return [];
  const records = loadTrackingRecords(bundleDirectory);
  const bundle = loadSourceBundleConfig(bundleDirectory);
  const protectedIds = new Set([bundle.entryBundleNodeId, bundle.defaultTraversalBundleNodeId,
    ...configs.flatMap(node => node.bundleNodeKind === 'collection' ? node.memberBundleNodeIds : [])]);
  const results: SourceOrphanExplanation[] = [];
  for (const config of configs) {
    if (config.listType === 'blacklist' || graph.nodes.some(node => node.bundleNodeId === config.bundleNodeId)) continue;
    const previous = records[config.bundleNodeId]?.lastReachable;
    const filename = snapshotFilePath(snapshot, config);
    let reason = config.bundleNodeKind === 'file' && !snapshot.files[filename]
      ? 'The source file is missing from this snapshot.'
      : 'The source still exists, but the current traversal or blacklist rules no longer reach it.';
    let brokenConnection: SourceOrphanExplanation['brokenConnection'];
    const route = previous?.route ?? [];
    for (let index = route.length - 1; index > 0; index -= 1) {
      const from = route[index - 1];
      const to = route[index];
      const linked = graph.allOutlinkTargets[from]?.includes(to) || graph.allInlinkSources[from]?.includes(to)
        || graph.edges.some(edge => edge.source === from && edge.target === to);
      if (!linked) {
        brokenConnection = { from, to };
        reason = !snapshot.files[from] && !snapshot.directories.includes(from.replace(/^folder:/, ''))
          ? `${from} is missing from the source snapshot.`
          : `${from} no longer connects to ${to} along the previously reachable route.`;
        break;
      }
    }
    results.push({ title: config.bundleNodeName, directory: config.sourceGraphSubdirectory ?? '', fileType: config.fileType ?? config.bundleNodeKind,
      ...(protectedIds.has(config.bundleNodeId) && { removalBlockedReason: 'This entry is required by the bundle’s traversal or selected folders. Repair its source or change the bundle settings first.' }),
      bundleNodeId: config.bundleNodeId, path: filename, previousPath: route, reason, ...(brokenConnection && { brokenConnection }) });
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
  const candidateGraph = candidate ? await availableSnapshotGraph(bundleDirectory, candidate, 0) : graph;
  const moves = candidate ? findSourceMoves(bundleDirectory, { ...accepted, graph }, { ...candidate, graph: candidateGraph }, configs) : [];
  const pairedOld = new Set(moves.map(move => move.oldPath));
  const pairedNew = new Set(moves.map(move => move.newPath));
  const pairedIds = new Set(moves.map(move => move.bundleNodeId));
  const byPath = new Map(configs.map(node => [snapshotFilePath(accepted, node), node.bundleNodeId]));
  const changes: SourcingReview['changes'] = [];
  if (candidate) {
    for (const [filename, file] of Object.entries(accepted.files)) {
      if (pairedOld.has(filename)) continue;
      if (!candidate.files[filename]) changes.push({ kind: 'missing', path: filename, bundleNodeId: byPath.get(filename) });
      else if (file.digest !== candidate.files[filename].digest) changes.push({ kind: 'modified', path: filename, bundleNodeId: byPath.get(filename) });
    }
    for (const filename of Object.keys(candidate.files)) {
      if (!accepted.files[filename] && !pairedNew.has(filename)) changes.push({ kind: 'added', path: filename });
    }
  }
  if (sourceConfigFingerprint(bundleDirectory) !== fingerprint && attempt < 2) return await buildSourceReview(bundleDirectory, attempt + 1);
  // Classify identities only after individual and grouped moves are assembled.
  // Both locators belong to that review item, including aliases in legacy config.
  const orphans = explainSourceOrphans(bundleDirectory, candidate ?? accepted, candidateGraph, configs)
    .filter(orphan => !pairedIds.has(orphan.bundleNodeId) && !pairedOld.has(orphan.path) && !pairedNew.has(orphan.path));
  return {
    accepted: state.history.find(item => item.id === accepted.id) ?? snapshotSummary(accepted),
    ...(candidate && { candidate: snapshotSummary(candidate) }), moves, changes,
    orphans, history: state.history,
    reviewToken: sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${fingerprint}`),
  };
}

export async function scanSourceChanges(bundleDirectory: string, replaceCandidate = false): Promise<SourcingReview> {
  await initializeSourcing(bundleDirectory);
  await withSourcingLock(bundleDirectory, async () => {
    const state = loadSourcingState(bundleDirectory)!;
    if (state.candidateId && !replaceCandidate) return;
    const liveDigest = liveSourceDigest(bundleDirectory);
    const comparisonId = state.candidateId ?? state.acceptedId;
    if (liveDigest === loadSourceSnapshot(bundleDirectory, comparisonId).digest) return;
    const captured = await captureSourceSnapshot(bundleDirectory);
    const previousCandidate = state.candidateId;
    if (captured.digest === loadSourceSnapshot(bundleDirectory, state.acceptedId).digest) {
      delete state.candidateId;
      fs.rmSync(snapshotDirectory(bundleDirectory, captured.id), { recursive: true });
    } else state.candidateId = captured.id;
    writeSourcingJson(sourcingStatePath(bundleDirectory), state);
    if (previousCandidate) fs.rmSync(snapshotDirectory(bundleDirectory, previousCandidate), { recursive: true, force: true });
  });
  return await sourcingReview(bundleDirectory);
}

export async function acceptSourceSnapshot(bundleDirectory: string, request: SourceSnapshotAcceptance): Promise<SourcingReview> {
  // Build the review before taking the write lock; acceptance checks its revision again inside it.
  const review = await sourcingReview(bundleDirectory);
  await withSourcingLock(bundleDirectory, async () => {
    const state = loadSourcingState(bundleDirectory)!;
    const token = sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${sourceConfigFingerprint(bundleDirectory)}`);
    if (request.reviewToken !== token || review.reviewToken !== token || (state.candidateId ?? state.acceptedId) !== request.candidateId) throw new SourcingError('This review is stale. Reopen source review before applying.');
    if (fs.existsSync(path.join(bundleDirectory, 'config/draft_bundle_node_config.yaml'))) throw new SourcingError('Save or undo curation changes before accepting a source update.');
    const removals = new Set(request.orphanRemovals ?? []);
    if (!state.candidateId && !removals.size) throw new SourcingError('Choose orphaned entries to remove or check for source changes.');
    for (const id of removals) {
      const orphan = review.orphans.find(item => item.bundleNodeId === id);
      if (!orphan || orphan.removalBlockedReason) throw new SourcingError('Only removable orphaned entries in this review can be removed.', 400);
    }
    const candidate = loadSourceSnapshot(bundleDirectory, request.candidateId);
    verifySourceSnapshot(bundleDirectory, candidate);
    const configs = loadSourceNodeConfigs(bundleDirectory);
    const candidateIds = new Set(review.moves.map(move => move.bundleNodeId));
    for (const id of Object.keys(request.resolutions)) if (!candidateIds.has(id)) throw new SourcingError('Unexpected source move resolution', 400);
    const resolutions = proposedSourceMoveResolutions(review.moves, request.resolutions);
    const destinations = new Set<string>();
    const relinked = configs.map(node => {
      if (!candidateIds.has(node.bundleNodeId)) return node;
      const destination = resolutions[node.bundleNodeId];
      if (destination === null) return node;
      if (node.bundleNodeKind === 'collection' || !review.moves.some(move => move.bundleNodeId === node.bundleNodeId && move.newPath === destination)) throw new SourcingError('Invalid source move choice', 400);
      if (destinations.has(destination)) throw new SourcingError('Two configured pages cannot be assigned to the same source file.');
      destinations.add(destination);
      return relinkSourceNode(node, destination);
    });
    const bundle = loadSourceBundleConfig(bundleDirectory);
    if (missingSnapshotRoles(candidate, bundle, relinked).length) throw new SourcingError('The bundle entry, traversal source, or selected folder is missing. Resolve its move before accepting this snapshot.');
    const relinkedGraph = await snapshotGraph(bundleDirectory, candidate, relinked, 0);
    const stillOrphaned = new Set(explainSourceOrphans(bundleDirectory, candidate, relinkedGraph, relinked).filter(item => !item.removalBlockedReason).map(item => item.bundleNodeId));
    for (const id of removals) if (!stillOrphaned.has(id)) throw new SourcingError('A selected entry is reachable after the chosen moves. Keep it and review the update again.');
    const next = relinked.filter(node => !removals.has(node.bundleNodeId));
    const graph = removals.size ? await snapshotGraph(bundleDirectory, candidate, next, 0) : relinkedGraph;
    if (token !== sha256(`${state.acceptedId}\0${state.candidateId ?? ''}\0${sourceConfigFingerprint(bundleDirectory)}`)) throw new SourcingError('Curation changed while applying. Review the source update again.');
    const acceptedAt = new Date().toISOString();
    installAcceptedSnapshot(bundleDirectory, state, {
      version: 1, acceptedId: candidate.id, history: state.candidateId ? [...state.history, snapshotSummary(candidate, acceptedAt)] : state.history,
    }, next);
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
  before: string | null; after: string | null; binary: boolean;
} {
  const state = loadSourcingState(bundleDirectory);
  const allowed = new Set([...(state?.history.map(item => item.id) ?? []), state?.candidateId]);
  if (!allowed.has(beforeId) || !allowed.has(afterId)) throw new SourcingError('Snapshot is not available in this bundle', 404);
  const read = (id: string, relative: string) => {
    const snapshot = loadSourceSnapshot(bundleDirectory, id);
    if (!snapshot.files[relative]) return null;
    if (snapshot.files[relative].size > 1024 * 1024) return '[File is too large for the inline comparison]';
    return fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, id), relative), 'utf8');
  };
  const binary = !/\.(md|txt|html|svg|css|js|json|yaml)$/i.test(afterPath || beforePath);
  return binary ? { before: null, after: null, binary } : { before: read(beforeId, beforePath), after: read(afterId, afterPath), binary };
}

import type { ParticipatesIn, sourceSnapshot } from '../../../../../../../concepts/index.js';
export type SourceAcceptanceMeadowConceptParticipations = [ParticipatesIn<typeof sourceSnapshot, "accept", typeof acceptSourceSnapshot>];
