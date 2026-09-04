/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { randomBytes } from 'crypto';
import type {
  GeneratedBundleVersionId,
  PredecessorCleanupPolicy,
  ProviderPublicationRevisionState,
  PublicationRevision,
  PublicationRevisionId,
  ReaderConnectionToPredecessor,
} from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import { PUBLICATION_REVISION_ID_PATTERN } from '../../../../../../../contracts/types/generatedBundleVersioning.js';

const PUBLICATION_REVISION_ID_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function requirePublicationRevisionId(value: unknown): PublicationRevisionId {
  if (typeof value !== 'string' || !PUBLICATION_REVISION_ID_PATTERN.test(value)) {
    throw new Error(`publicationRevisionId must match ${PUBLICATION_REVISION_ID_PATTERN.source}`);
  }
  return value as PublicationRevisionId;
}

export function generatePublicationRevisionId(
  existing: readonly PublicationRevisionId[],
  bytes: (size: number) => Buffer = randomBytes,
): PublicationRevisionId {
  const used = new Set(existing.map(value => value.toLowerCase()));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const random = bytes(12);
    if (random.length < 12) throw new Error('Publication revision ID random source returned fewer than twelve bytes');
    let candidate = 'r';
    for (let index = 0; index < 12; index += 1) {
      candidate += PUBLICATION_REVISION_ID_CHARACTERS[random[index] % PUBLICATION_REVISION_ID_CHARACTERS.length];
    }
    if (!used.has(candidate.toLowerCase())) return candidate as PublicationRevisionId;
  }
  throw new Error('Unable to allocate a unique publication revision ID');
}

export function currentPublicationRevision(
  state: ProviderPublicationRevisionState,
): PublicationRevision | null {
  return state.revisions.find(revision => revision.publicationRevisionId === state.currentRevisionId) ?? null;
}

export function pendingPublicationRevision(
  state: ProviderPublicationRevisionState,
): PublicationRevision | null {
  return state.revisions.find(revision => revision.publicationRevisionId === state.pendingRevisionId) ?? null;
}

export function planPublicationRevision<T extends ProviderPublicationRevisionState>(
  state: T,
  input: {
    generatedVersionId: GeneratedBundleVersionId;
    publishSlug: string;
    readerConnectionToPredecessor?: ReaderConnectionToPredecessor;
    predecessorCleanupPolicy?: PredecessorCleanupPolicy;
    now?: Date;
    randomBytes?: (size: number) => Buffer;
  },
): T {
  const current = currentPublicationRevision(state);
  const existing = state.revisions.find(revision =>
    revision.generatedVersionId === input.generatedVersionId
    && revision.publishSlug === input.publishSlug
  );
  if (existing && existing.remoteState !== 'pending') {
    const previousPending = pendingPublicationRevision(state);
    return {
      ...state,
      pendingRevisionId: existing.publicationRevisionId,
      revisions: previousPending?.remoteState === 'pending'
        && previousPending.publicationRevisionId !== existing.publicationRevisionId
        ? state.revisions.filter(revision => revision.publicationRevisionId !== previousPending.publicationRevisionId)
        : state.revisions,
    };
  }
  if (existing?.remoteState === 'pending') {
    const cleanupPolicy = input.predecessorCleanupPolicy ?? existing.predecessorCleanupPolicy;
    return {
      ...state,
      pendingRevisionId: existing.publicationRevisionId,
      revisions: state.revisions.map(revision => revision.publicationRevisionId === existing.publicationRevisionId
        ? {
            ...revision,
            readerConnectionToPredecessor: input.readerConnectionToPredecessor ?? revision.readerConnectionToPredecessor,
            predecessorCleanupPolicy: cleanupPolicy,
            cleanupState: cleanupPolicy === 'delete-after-success' ? 'scheduled' as const : 'not-requested' as const,
            cleanupError: undefined,
          }
        : revision),
    };
  }
  const pendingTarget = pendingPublicationRevision(state);
  const previousPending = pendingTarget?.remoteState === 'pending' ? pendingTarget : null;
  const revision: PublicationRevision = {
    publicationRevisionId: previousPending?.publicationRevisionId ?? generatePublicationRevisionId(
      state.revisions.map(item => item.publicationRevisionId),
      input.randomBytes,
    ),
    generatedVersionId: input.generatedVersionId,
    publishSlug: input.publishSlug,
    predecessorPublicationRevisionId: current?.publicationRevisionId ?? null,
    readerConnectionToPredecessor: current
      ? (input.readerConnectionToPredecessor ?? 'connected')
      : 'disconnected',
    predecessorCleanupPolicy: input.predecessorCleanupPolicy ?? 'keep',
    cleanupState: input.predecessorCleanupPolicy === 'delete-after-success' ? 'scheduled' : 'not-requested',
    remoteState: 'pending',
    createdAt: (input.now ?? new Date()).toISOString(),
    latestSuccessfulSavedGenerationId: null,
    publishedAt: null,
    deletedAt: null,
    remoteNamespace: null,
  };
  const revisions = previousPending
    ? state.revisions.map(item => item.publicationRevisionId === previousPending.publicationRevisionId ? revision : item)
    : [...state.revisions, revision];
  return { ...state, pendingRevisionId: revision.publicationRevisionId, revisions };
}

export function recordPublicationSuccess<T extends ProviderPublicationRevisionState>(
  state: T,
  input: {
    publicationRevisionId: PublicationRevisionId;
    savedGenerationId: string;
    remoteNamespace: string;
    publicUrl?: string;
    readerRouteIndex: string;
    entryPath: string;
    now?: Date;
  },
): T {
  let found = false;
  const timestamp = (input.now ?? new Date()).toISOString();
  const revisions = state.revisions.map(revision => {
    if (revision.publicationRevisionId !== input.publicationRevisionId) return revision;
    found = true;
    return {
      ...revision,
      remoteState: 'present' as const,
      latestSuccessfulSavedGenerationId: input.savedGenerationId,
      publishedAt: timestamp,
      deletedAt: null,
      remoteNamespace: input.remoteNamespace,
      ...(input.publicUrl ? { publicUrl: input.publicUrl } : {}),
      readerRouteIndex: input.readerRouteIndex,
      entryPath: input.entryPath,
    };
  });
  if (!found) throw new Error(`Unknown publication revision ${input.publicationRevisionId}`);
  return {
    ...state,
    revisions,
    currentRevisionId: input.publicationRevisionId,
    pendingRevisionId: state.pendingRevisionId === input.publicationRevisionId ? null : state.pendingRevisionId,
  };
}

export function recordPublicationDeletion<T extends ProviderPublicationRevisionState>(
  state: T,
  publicationRevisionId: PublicationRevisionId,
  now = new Date(),
): T {
  let found = false;
  const revisions = state.revisions.map(revision => {
    if (revision.publicationRevisionId !== publicationRevisionId) return revision;
    found = true;
    return { ...revision, remoteState: 'deleted' as const, deletedAt: now.toISOString() };
  });
  if (!found) throw new Error(`Unknown publication revision ${publicationRevisionId}`);
  let currentRevisionId = state.currentRevisionId;
  if (currentRevisionId === publicationRevisionId) {
    const byId = new Map(revisions.map(revision => [revision.publicationRevisionId, revision]));
    let cursor = byId.get(publicationRevisionId) ?? null;
    currentRevisionId = null;
    while (cursor?.predecessorPublicationRevisionId) {
      cursor = byId.get(cursor.predecessorPublicationRevisionId) ?? null;
      if (cursor?.remoteState === 'present') {
        currentRevisionId = cursor.publicationRevisionId;
        break;
      }
    }
  }
  return {
    ...state,
    revisions,
    currentRevisionId,
    pendingRevisionId: state.pendingRevisionId === publicationRevisionId ? null : state.pendingRevisionId,
  };
}

export function cancelPendingPublicationRevision<T extends ProviderPublicationRevisionState>(state: T): T {
  if (!state.pendingRevisionId) return state;
  const pendingId = state.pendingRevisionId;
  const pending = state.revisions.find(revision => revision.publicationRevisionId === pendingId);
  return {
    ...state,
    pendingRevisionId: null,
    revisions: pending?.remoteState === 'pending'
      ? state.revisions.filter(revision => revision.publicationRevisionId !== pendingId)
      : state.revisions,
  };
}

export function remotelyPresentPublicationRevisions(
  state: ProviderPublicationRevisionState,
): PublicationRevision[] {
  return state.revisions.filter(revision => revision.remoteState === 'present');
}

export function connectedPredecessorRevisionIds(
  state: ProviderPublicationRevisionState,
  fromRevisionId: PublicationRevisionId,
): PublicationRevisionId[] {
  const byId = new Map(state.revisions.map(revision => [revision.publicationRevisionId, revision]));
  const result: PublicationRevisionId[] = [];
  let cursor = byId.get(fromRevisionId) ?? null;
  while (cursor?.predecessorPublicationRevisionId && cursor.readerConnectionToPredecessor === 'connected') {
    const predecessor = byId.get(cursor.predecessorPublicationRevisionId) ?? null;
    if (!predecessor) break;
    if (predecessor.remoteState === 'present') result.push(predecessor.publicationRevisionId);
    cursor = predecessor;
  }
  return result;
}

/**
 * Revisions selected by a successor's delete-after-success policy. The direct
 * predecessor is selected independently of reader forwarding; older ancestors
 * are included while their existing reader lineage remains connected.
 */
export function predecessorRevisionIdsForCleanup(
  state: ProviderPublicationRevisionState,
  fromRevisionId: PublicationRevisionId,
): PublicationRevisionId[] {
  const byId = new Map(state.revisions.map(revision => [revision.publicationRevisionId, revision]));
  const result: PublicationRevisionId[] = [];
  let cursor = byId.get(fromRevisionId) ?? null;
  let predecessor = cursor?.predecessorPublicationRevisionId
    ? byId.get(cursor.predecessorPublicationRevisionId) ?? null
    : null;
  while (predecessor) {
    if (predecessor.remoteState === 'present') result.push(predecessor.publicationRevisionId);
    if (predecessor.readerConnectionToPredecessor !== 'connected' || !predecessor.predecessorPublicationRevisionId) break;
    predecessor = byId.get(predecessor.predecessorPublicationRevisionId) ?? null;
  }
  return result;
}

/** Resolve reader forwarding only along the explicitly selected current lineage. */
export function furthestConnectedPresentSuccessor(
  state: ProviderPublicationRevisionState,
  sourceRevisionId: PublicationRevisionId,
): PublicationRevision | null {
  const byId = new Map(state.revisions.map(revision => [revision.publicationRevisionId, revision]));
  const reverseLineage: PublicationRevision[] = [];
  const visited = new Set<PublicationRevisionId>();
  let cursor = state.currentRevisionId ? byId.get(state.currentRevisionId) ?? null : null;
  while (cursor && !visited.has(cursor.publicationRevisionId)) {
    visited.add(cursor.publicationRevisionId);
    reverseLineage.push(cursor);
    cursor = cursor.predecessorPublicationRevisionId
      ? byId.get(cursor.predecessorPublicationRevisionId) ?? null
      : null;
  }
  const lineage = reverseLineage.reverse();
  const sourceIndex = lineage.findIndex(revision => revision.publicationRevisionId === sourceRevisionId);
  if (sourceIndex < 0) return null;
  let successor: PublicationRevision | null = null;
  for (let index = sourceIndex + 1; index < lineage.length; index += 1) {
    const candidate = lineage[index];
    if (candidate.readerConnectionToPredecessor !== 'connected') break;
    if (candidate.remoteState === 'present') successor = candidate;
  }
  return successor;
}
