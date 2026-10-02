/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import type { SnapshotTrackingOutcome } from '../../../../../../../contracts/types/curationTracking.js';
import path from 'node:path';
import YAML from 'yaml';
import { applySourcingTransaction } from '../../../../../../../shared_code/utils/sourcingTransaction.js';
import { loadAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { stringifyBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { loadTrackingRecords } from '../../../../shared/bundle-node/trackingRecords.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { retainAcceptedSourceTree } from '../../../../shared/source-snapshot/sourceGit.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { loadSourceSnapshot, loadSourcingState, snapshotGraph, snapshotSummary, verifySourceSnapshot, SourcingError,
  withSourcingLock, sourcingRoot, snapshotFilePath } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { loadPendingSourceProposal, validateProposalConfiguration } from './proposalStore.js';
import { proposalReviewToken, reviewSourceProposal } from './proposalReview.js';
import { sourceSnapshotHistory } from './sourceReview.js';

/** Final validation and material installation form one recoverable source session. */
export async function acceptSourceProposal(directory: string, token: string) {
  return withSourcingLock(directory, async () => {
    if (!loadPendingSourceProposal(directory)) throw new SourcingError('There is no pending proposal to accept.');
    const review = await reviewSourceProposal(directory);
    if (review.reviewToken !== token) throw new SourcingError('This proposal changed. Review it again before accepting.');
    if (review.unresolvedIdentities.length) throw new SourcingError('Resolve page identities before accepting.');
    if (review.conflicts.length) throw new SourcingError('Resolve configuration conflicts before accepting.');
    if (review.missingRequiredEntries.length) throw new SourcingError('Repair missing required entries before accepting.');
    if (Object.values(review.proposal.tracking).some(decision => decision.needsConfirmation || decision.invalidated)) {
      throw new SourcingError('Review unresolved tracking decisions before accepting.');
    }
    if (fs.existsSync(path.join(directory, 'config/draft_bundle_node_config.yaml'))) throw new SourcingError('Save or undo accepted curation changes before accepting.');
    const state = loadSourcingState(directory)!;
    if (state.acceptedId !== review.proposal.acceptedSnapshotId) throw new SourcingError('Accepted sources changed. Reopen the proposal.');
    const candidate = loadSourceSnapshot(directory, review.proposal.candidateSnapshotId);
    verifySourceSnapshot(directory, candidate);
    const configuration = review.configuration;
    const graph = await snapshotGraph(directory, candidate, configuration.nodes, 0, false, configuration.bundle);
    const reachable = new Set(graph.nodes.filter(node => !node.isFrontierNode).map(node => node.bundleNodeId));
    // Traversal includes causal blacklist stops and structural exclusions. Controls
    // outside that scope are stale configuration, just like other unreachable entries.
    configuration.nodes = configuration.nodes.filter(node => reachable.has(node.bundleNodeId));
    validateProposalConfiguration(configuration);
    const now = new Date().toISOString();
    const records = loadTrackingRecords(directory);
    for (const id of Object.keys(records)) if (!configuration.nodes.some(node => node.bundleNodeId === id)) delete records[id];
    for (const config of configuration.nodes) {
      const node = graph.nodes.find(item => item.bundleNodeId === config.bundleNodeId);
      if (!node) continue;
      const route = [...node.path];
      if (route.at(-1) !== node.bundleNodeKey) route.push(node.bundleNodeKey);
      records[config.bundleNodeId] = { ...records[config.bundleNodeId], lastReachable: {
        keyEncodingVersion: 1, path: snapshotFilePath(candidate, config), snapshotId: candidate.id, route,
      } };
      const decision = review.proposal.tracking[node.bundleNodeKey];
      if (config.bundleNodeKind === 'file' && node.sourceFile && decision?.track) {
        records[config.bundleNodeId].evidence = { trackedAt: now,
          sourceContentDigest: `sha256:${node.sourceFile.digest.replace(/^sha256:/, '')}`,
          effectivelySensitive: Boolean(review.trackingTargets[node.bundleNodeKey]?.sensitivity) };
      }
    }
    // There was asynchronous graph work above. Protect edits from other clients made
    // during that work, including shared filter policy and conflict alternatives.
    const current = loadPendingSourceProposal(directory);
    if (!current || proposalReviewToken(directory, current) !== token) throw new SourcingError('Configuration changed during acceptance. Review the proposal again.');
    const home = getConfigDirectory();
    const app = loadAppConfig(home);
    app.deletedDefaultFilterIds = configuration.deletedDefaultFilterIds;
    const nextState = { version: 1, storage: 'git', acceptedId: candidate.id,
      history: candidate.id === state.acceptedId ? state.history : [...state.history, snapshotSummary(candidate, now)] };
    const history = [...(sourceSnapshotHistory(directory).acceptances ?? []), {
      proposalId: current.id, snapshotId: candidate.id, acceptedAt: now,
      identities: Object.entries(current.identities).flatMap(([id, destination]) => {
        const move = review.moves.find(item => item.bundleNodeId === id);
        return move ? [{ bundleNodeId: id, previousPath: move.oldPath, proposedPath: destination }] : [];
      }),
    }];
    {
      applySourcingTransaction(home, path.basename(directory), {
        bundle: YAML.stringify(configuration.bundle), nodes: stringifyBundleNodeConfig(configuration.nodes),
        bundleFilters: JSON.stringify({ filters: configuration.bundleFilters, version: '1.0.0' }, null, 2),
        globalFilters: JSON.stringify({ filters: configuration.globalFilters, version: '1.0.0' }, null, 2),
        app: YAML.stringify(app), state: `${JSON.stringify(nextState, null, 2)}\n`, tracking: `${JSON.stringify(records, null, 2)}\n`, proposal: null,
        acceptance: JSON.stringify({ proposalId: current.id, acceptedAt: now, snapshotId: candidate.id,
          previousSnapshotId: state.acceptedId, identities: current.identities, tracking: current.tracking }, null, 2),
        acceptanceHistory: JSON.stringify(history, null, 2),
      });
    }
    // The candidate ref already retains these immutable objects. Move the derived
    // accepted-history ref only after durable application, so a crash cannot publish
    // candidate history while recovery restores the previous accepted documents.
    try { if (candidate.git) retainAcceptedSourceTree(candidate.git); }
    catch (error) { logger.warn('Source proposal accepted; its source history reference could not be updated', error); }
    // The durable session record survives a failure to write optional Git history.
    await commitChangesNative([path.join(directory, 'config'), sourcingRoot(directory), path.join(home, 'app')],
      `accept sourcing proposal for ${path.basename(directory)}`, { configDir: home }).catch(error => {
      logger.warn('Source proposal accepted; its durable session record is saved, but Git history could not be recorded', error);
    });
    const trackingOutcome: SnapshotTrackingOutcome = { snapshotId: candidate.id, trackedNodeKeys: [], sensitiveSkipped: [], otherSkipped: [] };
    for (const [key, decision] of Object.entries(current.tracking)) {
      const node = graph.nodes.find(item => item.bundleNodeKey === key);
      if (!node) continue;
      if (decision.track) trackingOutcome.trackedNodeKeys.push(node.bundleNodeKey);
      else if (decision.origin === 'automatic' && configuration.bundle.trackNewPages !== false && review.trackingTargets[key]?.sensitivity) {
        trackingOutcome.sensitiveSkipped.push({ bundleNodeKey: node.bundleNodeKey, bundleNodeName: node.bundleNodeName });
      }
    }
    return { accepted: snapshotSummary(candidate, now), proposalId: current.id, trackingOutcome };
  });
}

import type { ParticipatesIn, sourceReviewCleanup } from '../../../../../../../concepts/index.js';
export type ProposalAcceptanceMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewCleanup, 'clean-accepted-scope', typeof acceptSourceProposal>,
];
