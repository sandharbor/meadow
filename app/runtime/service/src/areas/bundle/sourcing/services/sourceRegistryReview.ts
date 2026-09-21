/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import type { StartingSelection } from '../../../../../../../contracts/types/startingSelection.js';
import { applyStartingSelections } from '../../../../../../../shared_code/utils/startingSelectionUtils.js';
import path from 'node:path';
import YAML from 'yaml';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import { assignLegacySourceIdentity, bundleSources, validateBundleSources, validateSourceName } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import { textDocumentCodec, writeDurableDocument } from '../../../../../../../shared_code/utils/durableDocument.js';
import { sourceProposalContext } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import { retainCandidateSourceTree } from '../../../../shared/source-snapshot/sourceGit.js';
import { captureSourceSnapshot, initializeSourcing, loadSourceBundleConfig, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, sourceConfigFingerprint, snapshotDirectory, sourcingStatePath, SourcingError, withSourcingLock, writeSourcingJson, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

export function registryProposal(bundleDirectory: string, requested: BundleSource[], selections?: StartingSelection[], retained?: SourceSnapshot['sourceProposal']): NonNullable<SourceSnapshot['sourceProposal']> {
  const config = loadSourceBundleConfig(bundleDirectory);
  const previous = bundleSources(config);
  const sources = globalThis.structuredClone(requested).map(source => {
    const before = previous.find(item => item.id === source.id);
    // Old spellings remain reserved to this identity, including earlier aliases.
    return { ...source, aliases: [...new Set([...(source.aliases ?? []), ...(before?.aliases ?? []),
      ...(before && before.name !== source.name ? [before.name] : [])])].filter(alias => alias !== source.name) };
  });
  try { validateBundleSources(sources); } catch (error) { throw new SourcingError((error as Error).message, 400); }
  let nodes = assignLegacySourceIdentity(loadSourceNodeConfigs(bundleDirectory));
  if (retained) {
    const entry = retained.nodes.find(node => node.bundleNodeId === retained.entryBundleNodeId);
    const selectedIds = new Set([retained.entryBundleNodeId, retained.defaultTraversalBundleNodeId, ...(entry?.bundleNodeKind === 'collection' ? entry.memberBundleNodeIds : [])]);
    nodes.push(...retained.nodes.filter(node => selectedIds.has(node.bundleNodeId) && !nodes.some(current => current.bundleNodeId === node.bundleNodeId)));
  }
  let entryBundleNodeId = retained?.entryBundleNodeId ?? config.entryBundleNodeId!;
  let defaultTraversalBundleNodeId = config.defaultTraversalBundleNodeId!;
  if (selections) {
    try { ({ nodes, entryBundleNodeId, defaultTraversalBundleNodeId } = applyStartingSelections({ sources, selections, nodes, entryBundleNodeId, bundleName: path.basename(bundleDirectory) })); }
    catch (error) { throw new SourcingError((error as Error).message, 400); }
  }
  for (const node of nodes) if (node.bundleNodeKind === 'collection') {
    node.memberBundleNodeIds = node.memberBundleNodeIds.filter(id => {
      const member = nodes.find(item => item.bundleNodeId === id);
      return member && sources.some(source => source.id === member.sourceId);
    });
    if (!node.memberBundleNodeIds.length) throw new SourcingError('Removing this source leaves no starting selections. Choose a starting selection in bundle setup first.');
  }
  for (const id of [entryBundleNodeId, defaultTraversalBundleNodeId]) {
    const node = nodes.find(node => node.bundleNodeId === id);
    if (!node || (node.bundleNodeKind !== 'collection' && !sources.some(source => source.id === node.sourceId))) {
      throw new SourcingError('This source contains a required starting selection. Choose a starting selection in bundle setup before removing it.');
    }
  }
  return { sources, ...(config.sourceOutputLayout || sources.length > 1 ? { sourceOutputLayout: 'multi' as const } : {}),
    baseConfigFingerprint: sourceConfigFingerprint(bundleDirectory), ...(selections && { startingSelectionsChanged: true }), nodes,
    entryBundleNodeId, defaultTraversalBundleNodeId };
}

export async function stageSourceRegistry(bundleDirectory: string, sources: BundleSource[], selections?: StartingSelection[]): Promise<void> {
  await initializeSourcing(bundleDirectory);
  await withSourcingLock(bundleDirectory, async () => {
    if (fs.existsSync(path.join(bundleDirectory, 'config/draft_bundle_node_config.yaml'))) throw new SourcingError('Save or undo curation changes before changing sources.');
    const state = loadSourcingState(bundleDirectory)!;
    const proposal = registryProposal(bundleDirectory, sources, selections);
    const context = sourceProposalContext(loadSourceBundleConfig(bundleDirectory), [], { sourceProposal: proposal } as SourceSnapshot);
    let captured: SourceSnapshot | undefined;
    try {
      captured = await captureSourceSnapshot(bundleDirectory, { context });
      if (sourceConfigFingerprint(bundleDirectory) !== proposal.baseConfigFingerprint) throw new SourcingError('Bundle settings changed during source discovery. The previous review has been kept; try again.');
      captured.sourceProposal = proposal;
      writeSourcingJson(path.join(snapshotDirectory(bundleDirectory, captured.id), 'snapshot.json'), captured);
      writeSourcingJson(sourcingStatePath(bundleDirectory), { ...state, candidateId: captured.id });
    } catch (error) {
      const retained = loadSourceSnapshot(bundleDirectory, state.candidateId ?? state.acceptedId);
      if (retained.git) retainCandidateSourceTree(retained.git);
      if (captured) fs.rmSync(snapshotDirectory(bundleDirectory, captured.id), { recursive: true, force: true });
      throw error;
    }
  });
}

export async function cancelSourceCandidate(bundleDirectory: string): Promise<void> {
  await withSourcingLock(bundleDirectory, () => {
    const state = loadSourcingState(bundleDirectory);
    if (!state?.candidateId) return Promise.resolve();
    const accepted = loadSourceSnapshot(bundleDirectory, state.acceptedId);
    if (accepted.git) retainCandidateSourceTree(accepted.git);
    const next = { ...state };
    delete next.candidateId;
    writeSourcingJson(sourcingStatePath(bundleDirectory), next);
    return Promise.resolve();
  });
}

export async function setIgnoredSource(bundleDirectory: string, name: string, ignored: boolean): Promise<void> {
  try { validateSourceName(name); } catch (error) { throw new SourcingError((error as Error).message, 400); }
  await withSourcingLock(bundleDirectory, () => {
    const filename = path.join(bundleDirectory, 'config/bundle_config.yaml');
    const document = YAML.parseDocument(fs.readFileSync(filename, 'utf8'));
    const names = new Set(loadSourceBundleConfig(bundleDirectory).ignoredSourceNames ?? []);
    if (ignored) names.add(name); else names.delete(name);
    document.set('ignoredSourceNames', [...names].sort());
    writeDurableDocument({ path: filename, value: document.toString(), codec: textDocumentCodec });
    return Promise.resolve();
  });
}
