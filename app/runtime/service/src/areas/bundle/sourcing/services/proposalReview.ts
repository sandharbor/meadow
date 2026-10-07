/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceProposalReview, PendingSourceProposal } from '../../../../../../../contracts/types/sourcingProposal.js';
import { sameProposalValue } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { bundleNodeKeyFromConfig, serializeBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { sourcingQueryPrepareProposalTracking } from '../../curation/exported.js';
import { relinkSourceNode, explainSourceOrphans } from './sourceReview.js';
import { proposalMoveEvidence } from './proposalMoveEvidence.js';
import { beginSourceProposal, loadProposalConfiguration, sourceProposalConfigurationReview, saveSourceProposal } from './proposalStore.js';
import { availableSnapshotGraph, loadSourceSnapshot, missingSnapshotRoles, sha256, snapshotSummary, SourcingError,
  withSourcingLock } from '../../../../shared/source-snapshot/sourceSnapshots.js';

/** The token includes saved policy and the durable draft, never newer filesystem bytes. */
export function proposalReviewToken(directory: string, proposal: PendingSourceProposal): string {
  return sha256(JSON.stringify({ proposal, saved: loadProposalConfiguration(directory) }));
}

export async function reviewSourceProposal(directory: string): Promise<SourceProposalReview> {
  await beginSourceProposal(directory);
  return withSourcingLock(directory, async () => {
    let proposal = await beginSourceProposal(directory);
    // Older pending proposals may contain provisional automatic choices. Keep
    // accepted configuration and explicit choices; discard only that provisional policy.
    const automaticIds = new Set(Object.values(proposal.tracking).filter(decision => decision.origin === 'automatic').map(decision => decision.bundleNodeId));
    if (automaticIds.size) {
      const existingIds = new Set(proposal.original.nodes.map(node => node.bundleNodeId));
      proposal = saveSourceProposal(directory, { ...proposal,
        tracking: Object.fromEntries(Object.entries(proposal.tracking).filter(([, decision]) => decision.origin === 'explicit')),
        proposed: { ...proposal.proposed, nodes: proposal.proposed.nodes.filter(node => !automaticIds.has(node.bundleNodeId) || existingIds.has(node.bundleNodeId)) },
      }, proposal.revision);
    }
    const saved = loadProposalConfiguration(directory);
    const { configuration, conflicts } = sourceProposalConfigurationReview(directory, proposal);
    const accepted = loadSourceSnapshot(directory, proposal.acceptedSnapshotId);
    const candidate = loadSourceSnapshot(directory, proposal.candidateSnapshotId);
    const beforeGraph = await availableSnapshotGraph(directory, accepted, 0, { config: saved.bundle, nodes: saved.nodes });
    const beforeIdentity = await availableSnapshotGraph(directory, candidate, 0, { config: configuration.bundle, nodes: configuration.nodes });
    // Identity evidence survives explicit untracking and edits made after a confirmed move.
    const knownIdentities = [...new Map([...saved.nodes, ...proposal.original.nodes].map(node => [node.bundleNodeId, node])).values()];
    const moves = proposalMoveEvidence(directory, { ...accepted, graph: beforeGraph }, { ...candidate, graph: beforeIdentity }, knownIdentities)
      .map(move => ({ ...move, contentChanged: Boolean(accepted.files[move.oldPath] && candidate.files[move.newPath]
        && accepted.files[move.oldPath].digest !== candidate.files[move.newPath].digest) }));
    const unresolvedIdentities = [...new Set(moves.map(move => move.bundleNodeId))].filter(id => {
      const choice = proposal.identities[id];
      return choice !== null && !moves.some(move => move.bundleNodeId === id && move.newPath === choice);
    });
    const destinations = new Set<string>();
    configuration.nodes = configuration.nodes.map(node => {
      const destination = proposal.identities[node.bundleNodeId];
      if (typeof destination !== 'string' || !moves.some(move => move.bundleNodeId === node.bundleNodeId && move.newPath === destination)) return node;
      if (node.bundleNodeKind === 'collection' || destinations.has(destination)) throw new SourcingError('Two configured pages cannot share the same source identity.');
      destinations.add(destination);
      return relinkSourceNode(node, destination, candidate.sources);
    });
    const missingRequiredEntries = [...new Set([...(proposal.requiredEntryRepair ?? []), ...missingSnapshotRoles(candidate, configuration.bundle, configuration.nodes).map(node => node.bundleNodeName)])];
    let trackingTargets: SourceProposalReview['trackingTargets'] = {};
    if (!missingRequiredEntries.length && !unresolvedIdentities.length) {
      const identities = Object.fromEntries(knownIdentities.filter(node => node.bundleNodeKind !== 'collection').map(node => {
        const destination = proposal.identities[node.bundleNodeId];
        const located = typeof destination === 'string' ? relinkSourceNode(node, destination, candidate.sources) : node;
        return [serializeBundleNodeKey(bundleNodeKeyFromConfig(located)), node.bundleNodeId];
      }));
      const tracking = await sourcingQueryPrepareProposalTracking(directory, candidate.id, configuration, proposal.tracking, identities);
      configuration.nodes = tracking.nodes;
      trackingTargets = tracking.targets;
      if (!sameProposalValue(tracking.tracking, proposal.tracking)) {
        proposal = saveSourceProposal(directory, { ...proposal, tracking: tracking.tracking }, proposal.revision);
      }
    }
    if (!sameProposalValue(saved, loadProposalConfiguration(directory))) throw new SourcingError('Saved configuration changed during review. Reopen the proposal to see the current choices.');
    const afterGraph = await availableSnapshotGraph(directory, candidate, 0, { config: configuration.bundle, nodes: configuration.nodes });
    const pendingIdentityIds = new Set(moves.filter(move => proposal.identities[move.bundleNodeId] !== null).map(move => move.bundleNodeId));
    const orphans = explainSourceOrphans(directory, candidate, afterGraph, configuration.nodes, configuration.bundle, true)
      .filter(orphan => !pendingIdentityIds.has(orphan.bundleNodeId));
    return { proposal, configuration, conflicts, moves, orphans, unresolvedIdentities, missingRequiredEntries, trackingTargets,
      accepted: snapshotSummary(accepted), candidate: snapshotSummary(candidate), reviewToken: proposalReviewToken(directory, proposal) };
  });
}

import type { ParticipatesIn, pendingProposalRevalidation } from '../../../../../../../concepts/index.js';
export type ProposalReviewMeadowConceptParticipations = [
  ParticipatesIn<typeof pendingProposalRevalidation, 'review-proposal', typeof reviewSourceProposal>,
];
