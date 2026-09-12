/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export interface SourceSnapshotSummary {
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
  /** Bundle preference for tracking additions on acceptance; defaults to true. */
  trackNewPages?: boolean;
  accepted: SourceSnapshotSummary;
  candidate?: SourceSnapshotSummary;
  moves: SourceMoveCandidate[];
  changes: SourceFileChange[];
  orphans: SourceOrphanExplanation[];
  history: SourceSnapshotSummary[];
  reviewToken: string;
}

export interface SourceSnapshotAcceptance {
  /** Override and save this bundle’s preference when accepting the update. */
  trackNewPages?: boolean;
  candidateId: string;
  reviewToken: string;
  /** Overrides to the proposed matches. Omitted nodes use their proposed rename; null keeps pages separate. */
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
