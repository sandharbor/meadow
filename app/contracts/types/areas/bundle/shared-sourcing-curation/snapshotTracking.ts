/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { EncodedBundleNodeKey } from '../../../shared/bundle-graph/bundleNodeConfig.js';

/** A bounded request handed from Sourcing to Curation after accepting source material. */
export interface SnapshotTrackingRequest {
  snapshotId: string;
  /** Canonical working-graph keys for the reviewed files in the accepted snapshot. */
  nodeKeys: EncodedBundleNodeKey[];
}
