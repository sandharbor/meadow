/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../shared/bundle-config/bundleConfig.js';
import type { StartingSelection } from '../../../shared/sourcing/startingSelection.js';
import type { SourcingReview, SourceSnapshotSummary } from '../../../shared/sourcing/sourcing.js';
import type { SnapshotTrackingOutcome } from '../../../shared/curation/curationTracking.js';
import type { SnapshotTrackingRequest } from '../shared-sourcing-curation/snapshotTracking.js';

export interface SourceRegistryStatus {
  proposalRevision?: number;
  sources: BundleSource[];
  startingSelections: StartingSelection[];
  disconnectedIds: string[];
  ignoredSourceNames: string[];
  pendingChanges: boolean;
}

export interface SourceSnapshotAcceptanceResult extends SourcingReview {
  trackingRequest?: SnapshotTrackingRequest;
  trackingOutcome?: SnapshotTrackingOutcome;
}

/** Accepted source history; pending captures are intentionally excluded. */
export interface SourceSnapshotHistory {
  acceptedId: string | null;
  snapshots: SourceSnapshotSummary[];
  acceptances?: SourceProposalAcceptanceHistory[];
}

export interface SourceProposalAcceptanceHistory {
  proposalId: string;
  snapshotId: string;
  acceptedAt: string;
  identities: Array<{ bundleNodeId: string; previousPath: string; proposedPath: string | null }>;
}
