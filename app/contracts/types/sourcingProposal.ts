/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleConfig } from './bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from './bundleNodeConfig.js';
import type { CustomFilterConfig } from './customFilters.js';
import type { SourceMoveCandidate, SourceOrphanExplanation, SourceSnapshotSummary } from './sourcing.js';
import type { EncodedBundleNodeKey } from './bundleNodeKey.js';

/** A saved per-page setting that differs between the accepted and proposed configuration. Tracking is not a setting. */
export interface SourceSettingChange {
  setting: 'blacklist' | 'outlinksDepth' | 'inlinksDepth' | 'members';
  before?: boolean | number | string[];
  after?: boolean | number | string[];
}

/**
 * Why a page leaves through an upstream break in its accepted route, found by walking from the root.
 * `at` is the first route page that departs; `from` is the page before it whose link no longer reaches it.
 * `links` counts the route links from the break to the removed page.
 */
export type SourceRemovalCause =
  | { kind: 'blacklisted' | 'source-missing' | 'source-disconnected'; at: EncodedBundleNodeKey; links: number }
  | { kind: 'link-removed' | 'traversal'; from: EncodedBundleNodeKey; at: EncodedBundleNodeKey; links: number };

export interface SourceNodeReview {
  sensitivityReasons?: string[];
  kind: 'added' | 'modified' | 'departing' | 'moved' | 'unchanged' | 'frontier';
  removalReason?: 'source-missing' | 'unreachable' | 'source-disconnected' | 'blacklisted';
  /** For unreachable removals: the upstream break that disconnects this page. */
  removalCause?: SourceRemovalCause;
  /** Added and removed lines between the captures, computed with the review; null when there is no inline text diff. */
  lineCounts?: { added: number; removed: number } | null;
  /** Whether a departing page has previous content to show. */
  hasPreviousContent?: boolean;
  /** What changed for a page that remains: its captured source content, its saved settings, or both. */
  modification?: { source: boolean; settings: SourceSettingChange[] };
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
