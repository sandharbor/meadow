/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig } from '../bundle-graph/bundleNodeConfig.js';

export interface BlacklistShortcutUndo {
  acceptedSnapshotId: string;
  original: BundleNodeConfig[];
  applied: BundleNodeConfig[];
}
