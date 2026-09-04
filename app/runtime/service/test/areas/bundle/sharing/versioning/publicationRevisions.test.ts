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

import { describe, expect, it } from 'vitest';
import type {
  GeneratedBundleVersionId,
  ProviderPublicationRevisionState,
  PublicationRevisionId,
} from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import {
  cancelPendingPublicationRevision,
  furthestConnectedPresentSuccessor,
  pendingPublicationRevision,
  planPublicationRevision,
  predecessorRevisionIdsForCleanup,
  recordPublicationDeletion,
  recordPublicationSuccess,
} from '../../../../../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';

const version = (value: string) => value as GeneratedBundleVersionId;
const revision = (value: string) => value as PublicationRevisionId;

function empty(): ProviderPublicationRevisionState {
  return {
    schemaVersion: 2,
    providerInstanceId: 'test-provider',
    currentRevisionId: null,
    pendingRevisionId: null,
    revisions: [],
  };
}

function plan(state: ProviderPublicationRevisionState, versionId: string, publishSlug: string) {
  return planPublicationRevision(state, {
    generatedVersionId: version(versionId),
    publishSlug,
    randomBytes: () => Buffer.alloc(12, state.revisions.length + 1),
    now: new Date(`2026-01-0${state.revisions.length + 1}T00:00:00.000Z`),
  });
}

function succeed(state: ProviderPublicationRevisionState): ProviderPublicationRevisionState {
  const pending = pendingPublicationRevision(state)!;
  return recordPublicationSuccess(state, {
    publicationRevisionId: pending.publicationRevisionId,
    savedGenerationId: `tree-${pending.generatedVersionId}`,
    remoteNamespace: `${pending.publishSlug}-${pending.generatedVersionId}`,
    readerRouteIndex: '_mw_assets/versioning/routes.1234abcd.json',
    entryPath: 'index.html',
    now: new Date('2026-02-01T00:00:00.000Z'),
  });
}

describe('publication revisions', () => {
  it('creates revisions for either content or address changes and reuses the same pair', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    const first = state.currentRevisionId;
    state = succeed(plan(state, 'vAb3XyZ', 'orchard'));
    expect(state.revisions).toHaveLength(2);
    expect(state.revisions[1]).toMatchObject({
      generatedVersionId: 'vAb3XyZ',
      publishSlug: 'orchard',
      predecessorPublicationRevisionId: first,
    });
    state = plan(state, 'vAb3XyZ', 'orchard');
    expect(state.revisions).toHaveLength(2);
    expect(state.pendingRevisionId).toBe(state.currentRevisionId);
  });

  it('keeps exactly one never-published pending revision and cancellation removes it', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    state = plan(state, 'vQ7mN2p', 'garden');
    state = plan(state, 'vK8cR4s', 'orchard');
    expect(state.revisions.filter(item => item.remoteState === 'pending')).toHaveLength(1);
    expect(pendingPublicationRevision(state)).toMatchObject({ generatedVersionId: 'vK8cR4s', publishSlug: 'orchard' });
    state = cancelPendingPublicationRevision(state);
    expect(state.pendingRevisionId).toBeNull();
    expect(state.revisions.filter(item => item.remoteState === 'pending')).toEqual([]);
  });

  it('discards an abandoned address plan when the current published pair is selected again', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    const currentRevisionId = state.currentRevisionId;
    state = plan(state, 'vAb3XyZ', 'orchard');
    expect(state.revisions.filter(item => item.remoteState === 'pending')).toHaveLength(1);
    state = plan(state, 'vAb3XyZ', 'garden');
    expect(state.pendingRevisionId).toBe(currentRevisionId);
    expect(state.revisions).toHaveLength(1);
    expect(state.revisions.filter(item => item.remoteState === 'pending')).toEqual([]);
    state = plan(state, 'vQ7mN2p', 'garden');
    expect(state.pendingRevisionId).not.toBe(currentRevisionId);
    expect(pendingPublicationRevision(state)).toMatchObject({
      generatedVersionId: 'vQ7mN2p',
      predecessorPublicationRevisionId: currentRevisionId,
      remoteState: 'pending',
    });
  });

  it('moves the explicit head to the nearest retained predecessor when the current revision is deleted', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    const first = state.currentRevisionId!;
    state = succeed(plan(state, 'vQ7mN2p', 'garden'));
    state = recordPublicationDeletion(state, state.currentRevisionId!);
    expect(state.currentRevisionId).toBe(first);
  });

  it('applies retention independently of forwarding and stops at a disconnected older lineage', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    state = planPublicationRevision(state, {
      generatedVersionId: version('vQ7mN2p'),
      publishSlug: 'garden',
      readerConnectionToPredecessor: 'disconnected',
      randomBytes: () => Buffer.alloc(12, 2),
    });
    state = succeed(state);
    const second = state.currentRevisionId!;
    state = planPublicationRevision(state, {
      generatedVersionId: version('vK8cR4s'),
      publishSlug: 'orchard',
      readerConnectionToPredecessor: 'disconnected',
      predecessorCleanupPolicy: 'delete-after-success',
      randomBytes: () => Buffer.alloc(12, 3),
    });
    const pending = state.pendingRevisionId!;
    expect(predecessorRevisionIdsForCleanup(state, pending)).toEqual([second]);
  });

  it('forwards to the furthest present successor on the explicit head lineage across a deleted hop', () => {
    let state = succeed(plan(empty(), 'vAb3XyZ', 'garden'));
    const first = state.currentRevisionId!;
    state = succeed(plan(state, 'vQ7mN2p', 'garden'));
    const middle = state.currentRevisionId!;
    state = succeed(plan(state, 'vK8cR4s', 'orchard'));
    const head = state.currentRevisionId!;
    state = recordPublicationDeletion(state, middle);
    expect(furthestConnectedPresentSuccessor(state, first)?.publicationRevisionId).toBe(head);

    const branch = {
      ...state,
      currentRevisionId: first,
    };
    expect(furthestConnectedPresentSuccessor(branch, first)).toBeNull();
    expect(furthestConnectedPresentSuccessor(state, revision('rAAAAAAAAAAAA'))).toBeNull();
  });
});
