/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig } from './bundleNodeConfig.js';
import type { ProposalConfiguration } from './sourcingProposal.js';

export interface BlacklistShortcutUndo {
  acceptedSnapshotId: string;
  original: BundleNodeConfig[];
  applied: BundleNodeConfig[];
}
export type BlacklistEditResult =
  | { mode: 'curation'; undo: BlacklistShortcutUndo }
  | { mode: 'sourcing'; pendingConfiguration?: ProposalConfiguration };
