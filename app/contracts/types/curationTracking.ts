/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** A bounded request handed to curation after accepting source material. */
export interface SnapshotTrackingRequest {
  snapshotId: string;
  nodeKeys: string[];
}

export interface SnapshotTrackingOutcome {
  snapshotId: string;
  trackedNodeKeys: string[];
  sensitiveSkipped: Array<{ bundleNodeKey: string; bundleNodeName: string }>;
  otherSkipped: Array<{ bundleNodeKey: string; bundleNodeName: string }>;
  /** Acceptance succeeded, but curation could not finish the requested operation. */
  error?: string;
}

export type TrackingSensitivity = 'source' | 'filter';
