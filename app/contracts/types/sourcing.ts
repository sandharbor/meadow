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
  confidence: 'strong' | 'possible';
  competing: boolean;
  previousRoute: string[];
  currentRoute: string[];
}

export interface SourceFileChange {
  kind: 'added' | 'modified' | 'missing';
  path: string;
  bundleNodeId?: string;
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
}

export interface SourcingReview {
  accepted: SourceSnapshotSummary;
  candidate?: SourceSnapshotSummary;
  moves: SourceMoveCandidate[];
  changes: SourceFileChange[];
  orphans: SourceOrphanExplanation[];
  history: SourceSnapshotSummary[];
  reviewToken: string;
}

export interface SourceSnapshotAcceptance {
  candidateId: string;
  reviewToken: string;
  /** Overrides to the proposed matches. Omitted nodes use their proposed rename; null keeps pages separate. */
  resolutions: Record<string, string | null>;
  /** Config entries to remove alongside the reviewed source update; source files are retained. */
  orphanRemovals?: string[];
}
