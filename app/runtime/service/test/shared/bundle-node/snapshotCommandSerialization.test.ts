/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSerializedBundleNodeMutation } from '../../../src/shared/bundle-node/bundleNodeMutationQueue.js';
import { acceptSnapshotCommand } from '../../../src/areas/bundle/sourcing/services/acceptSnapshotCommand.js';
import { trackSnapshotAdditions } from '../../../src/areas/bundle/curation/services/snapshotTracking.js';
import type { SourceSnapshotAcceptance } from '../../../../../contracts/types/sourcing.js';

const state = vi.hoisted(() => ({ acceptedId: 'old', accept: vi.fn(), track: vi.fn() }));
vi.mock('../../../src/areas/bundle/sourcing/services/sourceReview.js', () => ({ acceptSourceSnapshot: state.accept }));
vi.mock('../../../src/shared/source-snapshot/sourceSnapshots.js', () => ({ loadSourcingState: () => ({ acceptedId: state.acceptedId }) }));
vi.mock('../../../src/areas/bundle/curation/services/bundleTrackingOperations.js', () => ({ trackBundleNodes: state.track }));

beforeEach(() => { state.acceptedId = 'old'; state.accept.mockReset(); state.track.mockReset(); });

describe('area commands own their shared bundle mutation safeguards', () => {
  it('waits for an ongoing bundle mutation before accepting sources', async () => {
    const gate = Promise.withResolvers<void>();
    const running = runSerializedBundleNodeMutation('bundle', () => gate.promise);
    state.accept.mockResolvedValue({ accepted: { id: 'new' } });
    const acceptance = acceptSnapshotCommand('/bundles/bundle', {} as SourceSnapshotAcceptance);
    await Promise.resolve();
    expect(state.accept).not.toHaveBeenCalled();
    gate.resolve();
    await running;
    expect(await acceptance).toEqual({ accepted: { id: 'new' } });
  });
  it('checks the handoff snapshot after waiting for earlier configuration mutations', async () => {
    const gate = Promise.withResolvers<void>();
    const running = runSerializedBundleNodeMutation('bundle', async () => {
      await gate.promise;
      state.acceptedId = 'new';
    });
    const tracking = trackSnapshotAdditions('/bundles/bundle', { snapshotId: 'old', nodeKeys: ['page.md'] });
    const rejected = expect(tracking).rejects.toThrow(/snapshot changed/);
    gate.resolve();
    await running;
    await rejected;
    expect(state.track).not.toHaveBeenCalled();
  });
  it('a failed mutation releases the queue for the next command', async () => {
    await expect(runSerializedBundleNodeMutation('bundle', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    state.track.mockResolvedValue({ newlyTracked: [], alreadyTracked: [], sensitiveSkipped: [], untrackableSkipped: [], rejected: [] });
    expect(await trackSnapshotAdditions('/bundles/bundle', { snapshotId: 'old', nodeKeys: [] })).toMatchObject({ trackedNodeKeys: [] });
  });
});
