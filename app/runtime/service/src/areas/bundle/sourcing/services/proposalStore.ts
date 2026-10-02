/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import type { PendingSourceProposal, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import { parseBundleNodeConfig, validateCanonicalBundleConfiguration } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { bundleCustomFiltersCodec, globalCustomFiltersCodec } from '../../../../../../../shared_code/utils/configDocumentCodecs.js';
import { loadGlobalCustomFilters } from '../../../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { readDurableDocument, requireValidDocument, isPlainObject } from '../../../../../../../shared_code/utils/durableDocument.js';
import { mergeProposalConfiguration } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { applySourcingTransaction } from '../../../../../../../shared_code/utils/sourcingTransaction.js';
import { retainCandidateSourceTree } from '../../../../shared/source-snapshot/sourceGit.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { sourceProposalContext } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import {
  initializeSourcing, loadSourceBundleConfig, loadSourceNodeConfigs, loadSourceSnapshot,
  loadSourcingState, sourcingRoot, SourcingError, withSourcingLock,
} from '../../../../shared/source-snapshot/sourceSnapshots.js';

export function proposalPath(directory: string): string { return path.join(sourcingRoot(directory), 'proposal.json'); }

export function loadProposalConfiguration(directory: string): ProposalConfiguration {
  const home = getConfigDirectory();
  const bundleFilters = requireValidDocument(readDurableDocument(path.join(directory, 'config/custom_filters.json'), bundleCustomFiltersCodec),
    () => ({ filters: [], version: '1.0.0' }));
  return { bundle: loadSourceBundleConfig(directory), nodes: loadSourceNodeConfigs(directory),
    bundleFilters: bundleFilters.filters, globalFilters: loadGlobalCustomFilters(home).filters,
    deletedDefaultFilterIds: loadAppConfig(home).deletedDefaultFilterIds ?? [] };
}

/** Each document keeps its existing validation, even while it is isolated in a proposal. */
export function validateProposalConfiguration(value: unknown): asserts value is ProposalConfiguration {
  if (!isPlainObject(value) || !isPlainObject(value.bundle) || !Array.isArray(value.nodes)
    || !Array.isArray(value.deletedDefaultFilterIds) || value.deletedDefaultFilterIds.some(id => typeof id !== 'string')) {
    throw new SourcingError('Invalid proposal configuration', 400);
  }
  const nodes = parseBundleNodeConfig(JSON.stringify({ nodes: value.nodes }));
  validateCanonicalBundleConfiguration({ bundleConfig: value.bundle, committedNodes: nodes });
  for (const [scope, codec] of [['bundle', bundleCustomFiltersCodec], ['global', globalCustomFiltersCodec]] as const) {
    const filters = value[`${scope}Filters`];
    const validated = codec.validate({ filters, version: '1.0.0' });
    if (!validated.valid || validated.value.filters.some(filter => filter.scope !== scope)) {
      throw new SourcingError(`Invalid ${scope} filter draft`, 400);
    }
  }
  const filters = [...value.bundleFilters as ProposalConfiguration['bundleFilters'], ...value.globalFilters as ProposalConfiguration['globalFilters']];
  if (new Set(filters.map(filter => filter.id)).size !== filters.length) throw new SourcingError('Each draft filter must have a unique identity', 400);
}

export function validateSourceProposal(value: unknown): asserts value is PendingSourceProposal {
  if (!isPlainObject(value) || value.version !== 1 || typeof value.id !== 'string'
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
    || typeof value.newerSourcesAvailable !== 'boolean'
    || ![value.acceptedSnapshotId, value.candidateSnapshotId].every(id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id))
    || !isPlainObject(value.identities) || Object.values(value.identities).some(destination => destination !== null && typeof destination !== 'string')
    || !isPlainObject(value.tracking) || !Array.isArray(value.resolutions)) throw new SourcingError('Invalid pending source proposal');
  validateProposalConfiguration(value.original);
  validateProposalConfiguration(value.proposed);
  for (const decision of Object.values(value.tracking)) {
    if (!isPlainObject(decision) || typeof decision.track !== 'boolean' || !['automatic', 'explicit'].includes(String(decision.origin))
      || (decision.confirmedSensitivity !== undefined && typeof decision.confirmedSensitivity !== 'string')
      || (decision.needsConfirmation !== undefined && typeof decision.needsConfirmation !== 'boolean')
      || (decision.identityChanged !== undefined && typeof decision.identityChanged !== 'boolean')
      || (decision.invalidated !== undefined && typeof decision.invalidated !== 'string')) throw new SourcingError('Invalid proposal tracking decision');
  }
  for (const resolution of value.resolutions) {
    if (!isPlainObject(resolution) || !Array.isArray(resolution.path) || resolution.path.some(segment => typeof segment !== 'string')
      || !['saved', 'proposed'].includes(String(resolution.choice))) throw new SourcingError('Invalid proposal conflict resolution');
  }
}

export function loadPendingSourceProposal(directory: string): PendingSourceProposal | undefined {
  getConfigDirectory(); // Recover an interrupted multi-document acceptance before reading its proposal.
  const filename = proposalPath(directory);
  if (!fs.existsSync(filename)) return undefined;
  const proposal: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  validateSourceProposal(proposal);
  return proposal;
}

function removeUnusedCandidate(directory: string, id: string): void {
  try { fs.rmSync(path.join(directory, 'raw/sourcing/snapshots', id), { recursive: true, force: true }); }
  catch (error) { logger.warn('Source proposal saved; unused candidate cleanup will need to be retried', error); }
}

/** Writes use optimistic revisions as well as the per-bundle queue. */
export function saveSourceProposal(directory: string, proposal: PendingSourceProposal, expectedRevision?: number): PendingSourceProposal {
  const current = loadPendingSourceProposal(directory);
  if (current?.revision !== expectedRevision || (current && current.id !== proposal.id)) {
    throw new SourcingError('This proposal changed in another window. Reopen it before editing.');
  }
  const next = { ...proposal, revision: (expectedRevision ?? 0) + 1, updatedAt: new Date().toISOString() };
  validateSourceProposal(next);
  const state = loadSourcingState(directory);
  if (!state || state.acceptedId !== next.acceptedSnapshotId) throw new SourcingError('Accepted sources changed while this proposal was pending.');
  const candidate = loadSourceSnapshot(directory, next.candidateSnapshotId);
  const nextState = { ...state, candidateId: next.candidateSnapshotId === state.acceptedId ? undefined : next.candidateSnapshotId };
  if (candidate.git) retainCandidateSourceTree(candidate.git);
  try {
    applySourcingTransaction(getConfigDirectory(), path.basename(directory), {
      proposal: `${JSON.stringify(next, null, 2)}\n`, state: `${JSON.stringify(nextState, null, 2)}\n`,
    });
  } catch (error) {
    const previous = loadSourceSnapshot(directory, current?.candidateSnapshotId ?? state.acceptedId);
    if (previous.git) retainCandidateSourceTree(previous.git);
    throw error;
  }
  if (current && current.candidateSnapshotId !== state.acceptedId && current.candidateSnapshotId !== next.candidateSnapshotId && !state.history.some(item => item.id === current.candidateSnapshotId)) {
    removeUnusedCandidate(directory, current.candidateSnapshotId);
  }
  return next;
}

export async function beginSourceProposal(directory: string): Promise<PendingSourceProposal> {
  await initializeSourcing(directory);
  return withSourcingLock(directory, () => {
    const pending = loadPendingSourceProposal(directory);
    if (pending) return Promise.resolve(pending);
    const state = loadSourcingState(directory)!;
    const original = loadProposalConfiguration(directory);
    const candidate = loadSourceSnapshot(directory, state.candidateId ?? state.acceptedId);
    const context = sourceProposalContext(original.bundle, original.nodes, state.candidateId ? candidate : undefined);
    return Promise.resolve(saveSourceProposal(directory, { version: 1, id: randomUUID(), revision: 1,
      acceptedSnapshotId: state.acceptedId, candidateSnapshotId: candidate.id,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      original, proposed: globalThis.structuredClone({ ...original, bundle: context.config, nodes: context.nodes }),
      identities: {}, tracking: {}, resolutions: [], newerSourcesAvailable: false }));
  });
}

export function sourceProposalConfigurationReview(directory: string, proposal = loadPendingSourceProposal(directory)) {
  if (!proposal) throw new SourcingError('There is no pending source proposal', 404);
  return mergeProposalConfiguration(proposal.original, loadProposalConfiguration(directory), proposal.proposed, proposal.resolutions);
}

export async function discardSourceProposal(directory: string, revision: number): Promise<void> {
  await withSourcingLock(directory, () => {
    const proposal = loadPendingSourceProposal(directory);
    if (!proposal || proposal.revision !== revision) throw new SourcingError('This proposal changed. Reopen it before discarding.');
    const state = loadSourcingState(directory)!;
    const next = { ...state };
    delete next.candidateId;
    const accepted = loadSourceSnapshot(directory, state.acceptedId);
    applySourcingTransaction(getConfigDirectory(), path.basename(directory), {
      proposal: null, state: `${JSON.stringify(next, null, 2)}\n`,
    });
    if (accepted.git) retainCandidateSourceTree(accepted.git);
    if (proposal.candidateSnapshotId !== state.acceptedId && !state.history.some(item => item.id === proposal.candidateSnapshotId)) {
      removeUnusedCandidate(directory, proposal.candidateSnapshotId);
    }
    return Promise.resolve();
  });
}

/** Later needs no write: every edit is already durable, independently of accepted curation. */
export async function editSourceProposal(directory: string, revision: number,
  edit: (proposal: PendingSourceProposal) => PendingSourceProposal | Promise<PendingSourceProposal>): Promise<PendingSourceProposal> {
  return withSourcingLock(directory, async () => {
    const current = loadPendingSourceProposal(directory);
    if (!current || current.revision !== revision) throw new SourcingError('This proposal changed. Reopen it before editing.');
    const next = await edit(globalThis.structuredClone(current));
    if (next.id !== current.id || next.acceptedSnapshotId !== current.acceptedSnapshotId) throw new SourcingError('Cannot replace the identity of a pending proposal');
    return saveSourceProposal(directory, next, revision);
  });
}

import type { ParticipatesIn, pendingSourceProposal } from '../../../../../../../concepts/index.js';
export type PendingProposalStorageMeadowConceptParticipations = [
  ParticipatesIn<typeof pendingSourceProposal, 'begin-proposal', typeof beginSourceProposal>,
  ParticipatesIn<typeof pendingSourceProposal, 'save-proposal', typeof saveSourceProposal>,
];
