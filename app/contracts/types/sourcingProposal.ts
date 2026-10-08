/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleConfig } from './bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from './bundleNodeConfig.js';
import type { CustomFilterConfig } from './customFilters.js';
import type { SourceMoveCandidate, SourceOrphanExplanation, SourceSnapshotSummary } from './sourcing.js';
import type { EncodedBundleNodeKey } from './bundleNodeKey.js';

export interface SourceNodeReview {
  sensitivityReasons?: string[];
  kind: 'added' | 'modified' | 'departing' | 'moved' | 'unchanged' | 'frontier';
  removalReason?: 'source-missing' | 'unreachable' | 'source-disconnected';
  orphanedConfiguration: boolean;
  /** Why the page's saved configuration became unreachable, when acceptance removes it. */
  orphan?: SourceOrphanExplanation;
  explanation: string;
  previousPath?: string;
  proposedPath?: string;
  previousRoute: EncodedBundleNodeKey[];
  proposedRoute: EncodedBundleNodeKey[];
  beforeSnapshotId: string;
  afterSnapshotId: string;
}

/** Saved business state. Presentation choices never participate in this merge. */
export interface ProposalConfiguration {
  bundle: BundleConfig;
  nodes: BundleNodeConfig[];
  bundleFilters: CustomFilterConfig[];
  globalFilters: CustomFilterConfig[];
  deletedDefaultFilterIds: string[];
}

export type ProposalValue = null | boolean | number | string | ProposalValue[] | { [key: string]: ProposalValue };

export interface ProposalConfigurationConflict {
  /** JSON path segments, including stable identities for nodes and filters. */
  path: string[];
  original?: ProposalValue;
  saved?: ProposalValue;
  proposed?: ProposalValue;
}

/** A choice is valid only for the exact three alternatives that were reviewed. */
export interface ProposalConflictResolution extends ProposalConfigurationConflict {
  choice: 'saved' | 'proposed';
}

export interface ProposalTrackingDecision {
  track: boolean;
  /** Automatic is accepted only to migrate older pending proposals. */
  origin: 'automatic' | 'explicit';
  bundleNodeId?: BundleNodeId;
  /** Fingerprint of the effective sensitivity evidence the person confirmed. */
  confirmedSensitivity?: string;
  needsConfirmation?: boolean;
  /** The page correspondence changed after this explicit choice. */
  identityChanged?: boolean;
  invalidated?: string;
}

export interface PendingSourceProposal {
  version: 1;
  id: string;
  revision: number;
  acceptedSnapshotId: string;
  candidateSnapshotId: string;
  createdAt: string;
  updatedAt: string;
  original: ProposalConfiguration;
  proposed: ProposalConfiguration;
  identities: Record<string, string | null>;
  tracking: Record<string, ProposalTrackingDecision>;
  resolutions: ProposalConflictResolution[];
  /** Kept separately so discovery cannot replace the material under review. */
  newerSourcesAvailable: boolean;
  /** An explicitly requested refresh could not rebuild these required entries. */
  requiredEntryRepair?: string[];
}

export interface SourceProposalReview {
  proposal: PendingSourceProposal;
  configuration: ProposalConfiguration;
  conflicts: ProposalConfigurationConflict[];
  moves: SourceMoveCandidate[];
  orphans: SourceOrphanExplanation[];
  unresolvedIdentities: string[];
  missingRequiredEntries: string[];
  trackingTargets: Record<string, { bundleNodeId?: BundleNodeId; sensitivity?: string; sensitivityReasons?: string[] }>;
  accepted: SourceSnapshotSummary;
  candidate: SourceSnapshotSummary;
  reviewToken: string;
}
