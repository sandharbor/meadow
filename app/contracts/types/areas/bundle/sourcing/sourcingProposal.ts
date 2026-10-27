/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from '../../../shared/bundle-graph/bundleNodeConfig.js';
import type { PendingSourceProposal, ProposalConfiguration, ProposalConfigurationConflict } from '../../../shared/sourcing/sourcingProposal.js';
import type { SourceMoveCandidate, SourceOrphanExplanation, SourceSnapshotSummary } from '../../../shared/sourcing/sourcing.js';

/** Added pages without an explicit tracking choice: the safe ones Track added pages covers, and the sensitive ones it skips. */
export interface ProposalAdditionTracking {
  enabled: boolean;
  eligible: string[];
  sensitiveSkipped: string[];
}

export interface SourceIdentityInspection {
  departing: Array<{ path: string; bundleNodeId?: string; reason: string }>;
  added: Array<{ path: string; reason: string }>;
}

export interface SourceProposalReview {
  identityInspection?: SourceIdentityInspection;
  proposal: PendingSourceProposal;
  configuration: ProposalConfiguration;
  conflicts: ProposalConfigurationConflict[];
  moves: SourceMoveCandidate[];
  orphans: SourceOrphanExplanation[];
  unresolvedIdentities: string[];
  missingRequiredEntries: string[];
  trackingTargets: Record<string, { bundleNodeId?: BundleNodeId; sensitivity?: string; sensitivityReasons?: string[]; untrackableReason?: string; assessmentIncomplete?: string; sensitivityChanged?: boolean }>;
  additionTracking: ProposalAdditionTracking;
  accepted: SourceSnapshotSummary;
  candidate: SourceSnapshotSummary;
  reviewToken: string;
}
