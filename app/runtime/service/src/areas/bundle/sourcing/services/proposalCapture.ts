/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { sourceForNode } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import type { PendingSourceProposal, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import { sameProposalValue, mergeProposalConfiguration } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { captureSourceSnapshot, discoverSourceSnapshot, loadSourceSnapshot, snapshotDirectory, SourcingError,
  withSourcingLock } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { retainCandidateSourceTree } from '../../../../shared/source-snapshot/sourceGit.js';
import { editSourceProposal, loadPendingSourceProposal, loadProposalConfiguration, sourceProposalConfigurationReview, validateProposalConfiguration } from './proposalStore.js';
import { relinkSourceNode } from './sourceReview.js';

function missingLiveRequiredEntries(configuration: ProposalConfiguration): string[] {
  const roles = new Set([configuration.bundle.entryBundleNodeId, configuration.bundle.defaultTraversalBundleNodeId]);
  for (const node of configuration.nodes) if (roles.has(node.bundleNodeId) && node.bundleNodeKind === 'collection') {
    node.memberBundleNodeIds.forEach(id => roles.add(id));
  }
  return configuration.nodes.filter(node => {
    if (!roles.has(node.bundleNodeId) || node.bundleNodeKind === 'collection') return false;
    const source = sourceForNode(configuration.bundle, node);
    if (!source) return true;
    // An unavailable source is a capture failure, not evidence that its entries disappeared.
    if (!fs.existsSync(source.directory)) return false;
    const directory = path.join(source.directory, node.sourceGraphSubdirectory ?? '');
    const filenames = node.bundleNodeKind === 'folder' ? [directory] : [path.join(directory, `${node.bundleNodeName}.${node.fileType}`),
      ...(node.fileType === 'excalidraw' ? [path.join(directory, `${node.bundleNodeName}.md`)] : [])];
    return !filenames.some(filename => {
      try { const stat = fs.statSync(filename); return node.bundleNodeKind === 'folder' ? stat.isDirectory() : stat.isFile(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    });
  }).map(node => node.bundleNodeName);
}

function withIdentityLocations(configuration: ProposalConfiguration, identities: Record<string, string | null>, sources: ProposalConfiguration['bundle']['sources']) {
  return { ...configuration, nodes: configuration.nodes.map(node => {
    const destination = identities[node.bundleNodeId];
    return node.bundleNodeKind !== 'collection' && typeof destination === 'string' ? relinkSourceNode(node, destination, sources) : node;
  }) };
}

function boundary(configuration: ProposalConfiguration) {
  const { sources, sourceDirectory, entryBundleNodeId, defaultTraversalBundleNodeId,
    defaultOutlinksDepth, defaultInlinksDepth, allowImagesToExtendToFrontier } = configuration.bundle;
  return { sources, sourceDirectory, entryBundleNodeId, defaultTraversalBundleNodeId,
    defaultOutlinksDepth, defaultInlinksDepth, allowImagesToExtendToFrontier,
    nodes: configuration.nodes.filter(node => node.listType === 'blacklist' || node.bundleNodeKind !== 'file'
      || node.outlinksDepth !== undefined || node.inlinksDepth !== undefined
      || node.bundleNodeId === entryBundleNodeId || node.bundleNodeId === defaultTraversalBundleNodeId)
      .map(node => ({ ...node, trackingEvidence: undefined })) };
}

/** A background check records availability; it never replaces the reviewed capture. */
export async function checkSourceProposalUpdates(directory: string, rebuildIndex = false) {
  return withSourcingLock(directory, async () => {
    const proposal = loadPendingSourceProposal(directory);
    if (!proposal) return;
    const configuration = withIdentityLocations(sourceProposalConfigurationReview(directory, proposal).configuration, proposal.identities,
      loadSourceSnapshot(directory, proposal.candidateSnapshotId).sources);
    const missing = missingLiveRequiredEntries(configuration);
    const discovered = missing.length ? undefined : await discoverSourceSnapshot(directory, rebuildIndex, { config: configuration.bundle, nodes: configuration.nodes });
    const available = !discovered || discovered.digest !== loadSourceSnapshot(directory, proposal.candidateSnapshotId).digest;
    if (available !== proposal.newerSourcesAvailable) await editSourceProposal(directory, proposal.revision,
      draft => ({ ...draft, newerSourcesAvailable: available }));
  });
}

/** Capture first, then atomically replace the proposal pointer; any failure keeps the old draft. */
export async function captureProposalEdit(directory: string, proposal: PendingSourceProposal, options: {
  configuration?: ProposalConfiguration; refresh?: boolean; incorporateNewerSources?: boolean;
}): Promise<PendingSourceProposal> {
    if (options.configuration) validateProposalConfiguration(options.configuration);
    const proposed = options.configuration ?? proposal.proposed;
    const changedBoundary = !sameProposalValue(boundary(proposal.proposed), boundary(proposed));
    if (!changedBoundary && !options.refresh) return { ...proposal, proposed };
    const saved = loadProposalConfiguration(directory);
    const old = mergeProposalConfiguration(proposal.original, saved, proposal.proposed, proposal.resolutions);
    const next = mergeProposalConfiguration(proposal.original, saved, proposed, proposal.resolutions);
    const sources = loadSourceSnapshot(directory, proposal.candidateSnapshotId).sources;
    old.configuration = withIdentityLocations(old.configuration, proposal.identities, sources);
    next.configuration = withIdentityLocations(next.configuration, proposal.identities, sources);
    if (next.conflicts.length) throw new SourcingError('Resolve competing configuration before rebuilding the proposal.');
    const requiredEntryRepair = missingLiveRequiredEntries(next.configuration);
    if (requiredEntryRepair.length) return { ...proposal, proposed, requiredEntryRepair, newerSourcesAvailable: true };
    if (changedBoundary && !options.incorporateNewerSources) {
      const discovery = await discoverSourceSnapshot(directory, false, { config: old.configuration.bundle, nodes: old.configuration.nodes });
      if (discovery.digest !== loadSourceSnapshot(directory, proposal.candidateSnapshotId).digest) {
        throw new SourcingError('This boundary change needs newer source material. Confirm updating sources to apply the change together.', 409, 'source-refresh-consent');
      }
    }
    let captured: Awaited<ReturnType<typeof captureSourceSnapshot>> | undefined;
    try {
      captured = await captureSourceSnapshot(directory, { context: { config: next.configuration.bundle, nodes: next.configuration.nodes } });
      if (!sameProposalValue(saved, loadProposalConfiguration(directory))) throw new SourcingError('Saved configuration changed during capture. The previous proposal has been kept.');
      return { ...proposal, proposed, candidateSnapshotId: captured.id, newerSourcesAvailable: false, requiredEntryRepair: undefined };
    } catch (error) {
      const previous = loadSourceSnapshot(directory, proposal.candidateSnapshotId);
      if (previous.git) retainCandidateSourceTree(previous.git);
      if (captured) fs.rmSync(snapshotDirectory(directory, captured.id), { recursive: true, force: true });
      throw error;
    }
}

export async function updateSourceProposalCapture(directory: string, revision: number, options: Parameters<typeof captureProposalEdit>[2]) {
  return editSourceProposal(directory, revision, proposal => captureProposalEdit(directory, proposal, options));
}

import type { ParticipatesIn, proposalConfigurationDraft } from '../../../../../../../concepts/index.js';
export type ProposalCaptureMeadowConceptParticipations = [
  ParticipatesIn<typeof proposalConfigurationDraft, 'stage-configuration', typeof updateSourceProposalCapture>,
];
