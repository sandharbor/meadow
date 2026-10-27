/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { EncodedBundleNodeKey } from '../bundle-graph/bundleNodeConfig.js';

export interface SnapshotTrackingOutcome {
  snapshotId: string;
  trackedNodeKeys: EncodedBundleNodeKey[];
  sensitiveSkipped: Array<{ bundleNodeKey: EncodedBundleNodeKey; bundleNodeName: string }>;
  otherSkipped: Array<{ bundleNodeKey: EncodedBundleNodeKey; bundleNodeName: string }>;
  /** Acceptance succeeded, but curation could not finish the requested operation. */
  error?: string;
}

export type TrackingSensitivity = 'source' | 'filter' | 'incomplete';
