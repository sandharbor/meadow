/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import type { SnapshotTrackingOutcome } from '../../../../../contracts/types/curationTracking.js';
import type { SourceSnapshotAcceptance, SourceSnapshotAcceptanceResult } from '../../../../../contracts/types/sourcing.js';
import { appShellCommandAcceptSourceSnapshot, appShellQuerySourceReview } from '../../areas/bundle/sourcing/exported.js';
import { appShellCommandTrackSnapshotAdditions } from '../../areas/bundle/curation/exported.js';

export const sourceCurationWorkflow = {
  accept: async (directory: string, request: SourceSnapshotAcceptance): Promise<SourceSnapshotAcceptanceResult> => {
    const accepted = await appShellCommandAcceptSourceSnapshot(directory, request);
    if (!accepted.trackingRequest) return accepted;
    let trackingOutcome: SnapshotTrackingOutcome;
    try {
      trackingOutcome = await appShellCommandTrackSnapshotAdditions(directory, accepted.trackingRequest);
    } catch (error) {
      // Acceptance is already durable. A curation failure must not pretend it failed.
      return { ...accepted, trackingOutcome: {
        snapshotId: accepted.trackingRequest.snapshotId, trackedNodeKeys: [], sensitiveSkipped: [],
        otherSkipped: accepted.trackingRequest.nodeKeys.map(bundleNodeKey => ({ bundleNodeKey, bundleNodeName: path.basename(bundleNodeKey) })),
        error: error instanceof Error ? error.message : String(error),
      } };
    }
    // Tracking changes the configuration revision used by later source reviews.
    const refreshed = await appShellQuerySourceReview(directory).catch(error => {
      logger.warn('Sources were accepted and tracking completed, but refreshing the source review failed', error);
      return accepted;
    });
    return { ...refreshed, trackingRequest: accepted.trackingRequest, trackingOutcome };
  },
};
