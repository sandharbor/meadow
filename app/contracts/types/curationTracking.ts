/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { EncodedBundleNodeKey } from './bundleNodeConfig.js';

/** A bounded request handed to curation after accepting source material. */
export interface SnapshotTrackingRequest {
  snapshotId: string;
  /** Canonical working-graph keys for the reviewed files in the accepted snapshot. */
  nodeKeys: EncodedBundleNodeKey[];
}

export interface SnapshotTrackingOutcome {
  snapshotId: string;
  trackedNodeKeys: EncodedBundleNodeKey[];
  sensitiveSkipped: Array<{ bundleNodeKey: EncodedBundleNodeKey; bundleNodeName: string }>;
  otherSkipped: Array<{ bundleNodeKey: EncodedBundleNodeKey; bundleNodeName: string }>;
  /** Acceptance succeeded, but curation could not finish the requested operation. */
  error?: string;
}

export type TrackingSensitivity = 'source' | 'filter';
