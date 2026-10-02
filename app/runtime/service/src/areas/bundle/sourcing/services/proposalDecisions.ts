/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { sameProposalValue } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { sourcingQueryPrepareProposalTracking } from '../../curation/exported.js';
import { captureProposalEdit } from './proposalCapture.js';
import { editSourceProposal } from './proposalStore.js';
import { reviewSourceProposal } from './proposalReview.js';
import { bundleNodeKeyFromConfig, serializeBundleNodeKey } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { relinkSourceNode } from './sourceReview.js';
import { loadSourceSnapshot, snapshotFilePath } from '../../../../shared/source-snapshot/sourceSnapshots.js';

export async function chooseProposalIdentities(directory: string, revision: number, choices: Record<string, string | null>) {
  const review = await reviewSourceProposal(directory);
  for (const [id, destination] of Object.entries(choices)) {
    if (!review.moves.some(move => move.bundleNodeId === id && (destination === null || move.newPath === destination))) {
      throw new SourcingError('This identity is not available in the reviewed proposal.', 400);
    }
  }
  const destinations = Object.values({ ...review.proposal.identities, ...choices }).filter(value => value !== null);
  if (new Set(destinations).size !== destinations.length) throw new SourcingError('Two configured pages cannot share the same source identity.', 400);
  return editSourceProposal(directory, revision, proposal => {
    const accepted = loadSourceSnapshot(directory, proposal.acceptedSnapshotId);
    const affected = new Set<string>();
    for (const [id, destination] of Object.entries(choices)) {
      const previous = proposal.identities[id];
      if (previous === destination) continue;
      // Keep configuration attached to its stable identity, not its last preview location.
      const original = proposal.original.nodes.find(node => node.bundleNodeId === id);
      if (original && original.bundleNodeKind !== 'collection') for (const filename of [previous, destination]) {
        if (typeof filename === 'string') affected.add(serializeBundleNodeKey(bundleNodeKeyFromConfig(relinkSourceNode(original, filename, loadSourceSnapshot(directory, proposal.candidateSnapshotId).sources))));
      }
      if (original && original.bundleNodeKind !== 'collection') proposal.proposed.nodes = proposal.proposed.nodes.map(node =>
        node.bundleNodeId === id && node.bundleNodeKind !== 'collection' ? relinkSourceNode(node, snapshotFilePath(accepted, original), accepted.sources) : node);
    }
    for (const key of affected) {
      const decision = proposal.tracking[key];
      if (!decision) continue;
      if (!proposal.original.nodes.some(node => node.bundleNodeId === decision.bundleNodeId)) proposal.proposed.nodes = proposal.proposed.nodes.filter(node => node.bundleNodeId !== decision.bundleNodeId);
      if (decision.origin === 'automatic') delete proposal.tracking[key];
      else decision.identityChanged = true;
    }
    return { ...proposal, identities: { ...proposal.identities, ...choices } };
  });
}

export async function resolveProposalConflicts(directory: string, revision: number, choices: Array<{ path: string[]; choice: 'saved' | 'proposed' }>, reviewToken: string) {
  const review = await reviewSourceProposal(directory);
  if (review.reviewToken !== reviewToken) throw new SourcingError('This conflict changed. Review its current alternatives.', 409);
  const resolutions = choices.map(choice => {
    const conflict = review.conflicts.find(item => sameProposalValue(item.path, choice.path));
    if (!conflict || !['saved', 'proposed'].includes(choice.choice)) throw new SourcingError('This conflict changed. Review its current alternatives.', 400);
    return { ...conflict, choice: choice.choice };
  });
  return editSourceProposal(directory, revision, proposal => {
    for (const choice of choices) {
      if (choice.choice !== 'saved' || choice.path[0] !== 'nodes' || choice.path.length !== 2) continue;
      for (const [key, decision] of Object.entries(proposal.tracking)) {
        if (decision.bundleNodeId === choice.path[1]) delete proposal.tracking[key];
      }
    }
    return { ...proposal, resolutions: [...proposal.resolutions.filter(item => !choices.some(choice => sameProposalValue(item.path, choice.path))), ...resolutions] };
  });
}

/** Mixed selections operate only on candidates and return every skipped comparison node. */
export async function chooseProposalTracking(directory: string, revision: number, keys: string[], track: boolean, confirmSensitive = false, incorporateNewerSources = false) {
  const review = await reviewSourceProposal(directory);
  const eligible = keys.filter(key => review.trackingTargets[key] || (!track && review.proposal.tracking[key]));
  const skipped = keys.filter(key => !eligible.includes(key));
  const result = await editSourceProposal(directory, revision, async proposal => {
    const proposed = globalThis.structuredClone(proposal.proposed);
    const tracking = { ...proposal.tracking };
    for (const key of eligible) tracking[key] = { ...tracking[key], track, origin: 'explicit', identityChanged: undefined,
      ...(tracking[key]?.identityChanged && { bundleNodeId: review.trackingTargets[key]?.bundleNodeId }),
      confirmedSensitivity: confirmSensitive ? review.trackingTargets[key]?.sensitivity : tracking[key]?.identityChanged ? undefined : tracking[key]?.confirmedSensitivity };
    const plan = await sourcingQueryPrepareProposalTracking(directory, proposal.candidateSnapshotId, review.configuration, tracking);
    for (const key of eligible) {
      const id = plan.tracking[key]?.bundleNodeId;
      if (!id) continue;
      if (!track) proposed.nodes = proposed.nodes.filter(node => node.bundleNodeId !== id);
      else if (!proposed.nodes.some(node => node.bundleNodeId === id)) {
        const config = plan.nodes.find(node => node.bundleNodeId === id);
        if (config) proposed.nodes.push(config);
      }
    }
    return { ...await captureProposalEdit(directory, proposal, { configuration: proposed, incorporateNewerSources }), tracking: plan.tracking };
  });
  return { proposal: result, skipped };
}

import type { ParticipatesIn, sourceReviewIdentity } from '../../../../../../../concepts/index.js';
export type ProposalDecisionsMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewIdentity, 'choose-identities', typeof chooseProposalIdentities>,
];
