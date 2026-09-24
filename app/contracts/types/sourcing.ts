/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from './bundleConfig.js';
import type { StartingSelection } from './startingSelection.js';
import type { SerializableBundleNode } from './IBundleNode.js';
import type { IEdge } from './graph.js';
import type { SnapshotTrackingRequest, SnapshotTrackingOutcome, TrackingSensitivity } from './curationTracking.js';

export interface SourceRegistryStatus {
  sources: BundleSource[];
  startingSelections: StartingSelection[];
  disconnectedIds: string[];
  ignoredSourceNames: string[];
  pendingChanges: boolean;
}

/** Only the nodes and connections needed to explain this review's routes. */
export interface SourceTraversalGraph {
  sources?: BundleSource[];
  snapshotId: string;
  nodes: SerializableBundleNode[];
  edges: IEdge[];
}

export interface SourceSnapshotSummary {
  sourceNames?: Pick<BundleSource, 'id' | 'name' | 'aliases'>[];
  id: string;
  capturedAt: string;
  acceptedAt?: string;
  fileCount: number;
}

export interface SourceMoveCandidate {
  bundleNodeId: string;
  oldPath: string;
  newPath: string;
  evidence: string[];
  /** True only when the two captured files have different content digests. */
  contentChanged?: boolean;
  confidence: 'strong' | 'possible';
  competing: boolean;
  previousRoute: string[];
  currentRoute: string[];
}

export interface SourceFileChange {
  /** Missing means absent from the candidate snapshot, not necessarily from the filesystem. */
  kind: 'added' | 'modified' | 'missing';
  previousPath?: string;
  path: string;
  bundleNodeId?: string;
  /** Captured route explaining why a newly included source is reachable. */
  route?: string[];
}

export interface SourceOrphanExplanation {
  title: string;
  directory: string;
  fileType: string;
  removalBlockedReason?: string;
  bundleNodeId: string;
  path: string;
  previousPath: string[];
  reason: string;
  brokenConnection?: { from: string; to: string };
  /** Filesystem absence is confirmed against the available live source, not inferred from capture scope. */
  diagnosis?: { kind: 'missing-file'; from?: string; to: string }
    | { kind: 'removed-link'; from: string; to: string }
    | { kind: 'outside-graph'; to: string };
}

export interface SourcingReview {
  sourceChanges?: { before: BundleSource[]; after: BundleSource[]; outputPathsChange: boolean; stale: boolean; startingSelectionsChanged?: boolean };
  /** Curation's assessment of reviewed additions; informational, not a tracking decision. */
  trackingSensitivity?: Record<string, TrackingSensitivity>;
  /** Traversals evaluated separately against each snapshot, using the reviewed configuration. */
  traversalGraphs?: { accepted?: SourceTraversalGraph; candidate?: SourceTraversalGraph };
  /** Bundle preference for requesting safe bulk tracking after acceptance; defaults to true. */
  trackNewPages?: boolean;
  accepted: SourceSnapshotSummary;
  candidate?: SourceSnapshotSummary;
  moves: SourceMoveCandidate[];
  changes: SourceFileChange[];
  orphans: SourceOrphanExplanation[];
  history: SourceSnapshotSummary[];
  reviewToken: string;
}

export interface SourceSnapshotAcceptanceResult extends SourcingReview {
  trackingRequest?: SnapshotTrackingRequest;
  trackingOutcome?: SnapshotTrackingOutcome;
}

export interface SourceSnapshotAcceptance {
  /** Override and save this bundle’s preference when accepting the update. */
  trackNewPages?: boolean;
  candidateId: string;
  reviewToken: string;
  /** Uncontested matches may be omitted. Competing matches require a destination or null to keep pages separate. */
  resolutions: Record<string, string | null>;
  /** Explicit exceptions to default orphan cleanup. Source files are retained. */
  orphanKeeps?: string[];
  /** Legacy explicit removal selection. Omission removes all eligible orphans except orphanKeeps. */
  orphanRemovals?: string[];
}

/** Accepted source history; pending captures are intentionally excluded. */
export interface SourceSnapshotHistory {
  acceptedId: string | null;
  snapshots: SourceSnapshotSummary[];
}
export interface SourceReferenceDiagnostic {
  path: string;
  code: 'unregisteredSource' | 'invalidSourceReference';
  message: string;
  requestedSource: string;
  linkOriginalText: string;
}
