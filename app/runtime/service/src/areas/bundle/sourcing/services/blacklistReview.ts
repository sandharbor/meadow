/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { bundleNodeConfigToKey } from '../../../../shared/bundle-node/nodeKeys.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { BlacklistEditResult, BlacklistShortcutUndo } from '../../../../../../../contracts/types/blacklistReview.js';
import { stringifyBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { sameProposalValue } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { applySourcingTransaction } from '../../../../../../../shared_code/utils/sourcingTransaction.js';
import { loadProposalConfiguration, validateProposalConfiguration } from './proposalStore.js';
import { reviewSourceProposal } from './proposalReview.js';
import { updateSourceProposalCapture } from './proposalCapture.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { availableSnapshotGraph, discoverSourceSnapshot, initializeSourcing, loadSourcingState, loadSourceSnapshot, SourcingError, withSourcingLock } from '../../../../shared/source-snapshot/sourceSnapshots.js';

function patchBlacklist(nodes: BundleNodeConfig[], changes: BundleNodeConfig[]): BundleNodeConfig[] {
  const result = globalThis.structuredClone(nodes);
  for (const change of changes) {
    const index = result.findIndex(node => node.bundleNodeId === change.bundleNodeId);
    if (index < 0) result.push(change);
    else result[index].listType = change.listType;
  }
  return result;
}

/** Scope is calculated from complete captures/discovery, independently of display filters. */
export async function applyBlacklistEdit(directory: string, changes: BundleNodeConfig[]): Promise<BlacklistEditResult> {
  await initializeSourcing(directory);
  return withSourcingLock(directory, async () => {
    const saved = loadProposalConfiguration(directory);
    const configuration = { ...saved, nodes: patchBlacklist(saved.nodes, changes) };
    validateProposalConfiguration(configuration);
    const acceptedId = loadSourcingState(directory)!.acceptedId;
    const snapshot = loadSourceSnapshot(directory, acceptedId);
    const fullScope = { ...saved.bundle, defaultTraversalBundleNodeId: saved.bundle.entryBundleNodeId };
    const before = await availableSnapshotGraph(directory, snapshot, 0, { config: fullScope, nodes: saved.nodes });
    const after = await availableSnapshotGraph(directory, snapshot, 0, { config: fullScope, nodes: configuration.nodes });
    const live = await discoverSourceSnapshot(directory, false, { config: fullScope, nodes: configuration.nodes });
    if (!before || !after) throw new SourcingError('Repair the required source entries before editing this boundary.');
    const selectedKeys = new Set(changes.map(bundleNodeConfigToKey));
    const included = (graph: NonNullable<typeof before>, configs: BundleNodeConfig[]) => {
      const blacklisted = new Set<string>(configs.filter(node => node.listType === 'blacklist').map(node => node.bundleNodeId));
      return new Set(graph.nodes.filter(node => !node.isFrontierNode && !blacklisted.has(node.bundleNodeId ?? '') && !node.effectiveBlacklistingBundleNodeId).map(node => node.bundleNodeKey));
    };
    const originalKeys = included(before, saved.nodes);
    const changesOthers = (graph: NonNullable<typeof before>) => {
      const next = included(graph, configuration.nodes);
      return [...new Set([...originalKeys, ...next])].some(key => !selectedKeys.has(key) && originalKeys.has(key) !== next.has(key));
    };
    if (!sameProposalValue(saved, loadProposalConfiguration(directory)) || loadSourcingState(directory)?.acceptedId !== acceptedId) {
      throw new SourcingError('Saved configuration changed while checking the blacklist impact. Try the edit again.');
    }
    if (changes.length === 1 && live.graph && !changesOthers(after) && !changesOthers(live.graph)) {
      const home = getConfigDirectory();
      applySourcingTransaction(home, path.basename(directory), { nodes: stringifyBundleNodeConfig(configuration.nodes) });
      await commitChangesNative([path.join(directory, 'config')], 'update blacklist with no wider scope changes', { configDir: home });
      return { mode: 'curation', undo: { acceptedSnapshotId: acceptedId, original: saved.nodes, applied: loadProposalConfiguration(directory).nodes } };
    }
    const review = await reviewSourceProposal(directory);
    const proposed = { ...review.proposal.proposed, nodes: patchBlacklist(review.proposal.proposed.nodes, changes) };
    try { await updateSourceProposalCapture(directory, review.proposal.revision, { configuration: proposed }); }
    catch (error) {
      if (!(error instanceof SourcingError) || error.code !== 'source-refresh-consent') throw error;
      return { mode: 'sourcing', pendingConfiguration: proposed };
    }
    return { mode: 'sourcing' };
  });
}

/** A shortcut can be undone only against the state it actually wrote. */
export async function undoBlacklistEdit(directory: string, undo: BlacklistShortcutUndo): Promise<void> {
  return withSourcingLock(directory, async () => {
    const saved = loadProposalConfiguration(directory);
    if (loadSourcingState(directory)?.acceptedId !== undo.acceptedSnapshotId || !sameProposalValue(saved.nodes, undo.applied)) {
      throw new SourcingError('Configuration changed after this edit. Review the current settings before undoing it.');
    }
    validateProposalConfiguration({ ...saved, nodes: undo.original });
    const home = getConfigDirectory();
    applySourcingTransaction(home, path.basename(directory), { nodes: stringifyBundleNodeConfig(undo.original) });
    await commitChangesNative([path.join(directory, 'config')], 'undo blacklist shortcut', { configDir: home });
  });
}

import type { ParticipatesIn, sourceReviewTrigger } from '../../../../../../../concepts/index.js';
export type BlacklistReviewMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewTrigger, 'route-blacklist-edit', typeof applyBlacklistEdit>,
];
