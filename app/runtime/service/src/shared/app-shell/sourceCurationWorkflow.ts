/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import type { SnapshotTrackingOutcome } from '../../../../../contracts/types/curationTracking.js';
import type { SourcingReview, SourceSnapshotAcceptance, SourceSnapshotAcceptanceResult } from '../../../../../contracts/types/sourcing.js';
import { acceptSourceSnapshot, scanSourceChanges, sourcingReview } from '../../areas/bundle/sourcing/services/sourceReview.js';
import { snapshotTrackingSensitivity, trackSnapshotAdditions } from '../../areas/bundle/curation/services/snapshotTracking.js';
import { runSerializedBundleNodeMutation } from '../../areas/bundle/curation/services/bundleNodeMutationQueue.js';

async function withTrackingAssessment(directory: string, review: SourcingReview): Promise<SourcingReview> {
  const added = review.changes.filter(change => change.kind === 'added').map(change => change.path);
  return { ...review, trackingSensitivity: await snapshotTrackingSensitivity(directory, review.candidate?.id ?? review.accepted.id, added) };
}

export const sourceCurationWorkflow = {
  review: async (directory: string) => withTrackingAssessment(directory, await sourcingReview(directory)),
  scan: async (directory: string, replaceCandidate: boolean, rebuildIndex: boolean) =>
    withTrackingAssessment(directory, await scanSourceChanges(directory, replaceCandidate, rebuildIndex)),
  accept: async (directory: string, request: SourceSnapshotAcceptance): Promise<SourceSnapshotAcceptanceResult> =>
    runSerializedBundleNodeMutation(path.basename(directory), async () => {
      const accepted = await acceptSourceSnapshot(directory, request);
      if (!accepted.trackingRequest) return accepted;
      let trackingOutcome: SnapshotTrackingOutcome;
      try {
        trackingOutcome = await trackSnapshotAdditions(directory, accepted.trackingRequest);
      } catch (error) {
        // Acceptance is already durable. A curation failure must not pretend it failed.
        return { ...accepted, trackingOutcome: {
          snapshotId: accepted.trackingRequest.snapshotId, trackedNodeKeys: [], sensitiveSkipped: [],
          otherSkipped: accepted.trackingRequest.nodeKeys.map(bundleNodeKey => ({ bundleNodeKey, bundleNodeName: path.basename(bundleNodeKey) })),
          error: error instanceof Error ? error.message : String(error),
        } };
      }
      // Tracking changes the configuration revision used by later source reviews.
      const refreshed = await sourcingReview(directory).catch(error => {
        logger.warn('Sources were accepted and tracking completed, but refreshing the source review failed', error);
        return accepted;
      });
      return { ...refreshed, trackingRequest: accepted.trackingRequest, trackingOutcome };
    }),
};
