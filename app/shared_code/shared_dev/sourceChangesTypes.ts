/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export const SOURCE_CHANGE_CATEGORIES = ['add', 'move', 'rename', 'modify', 'remove'] as const;
export type SourceChangeCategory = typeof SOURCE_CHANGE_CATEGORIES[number];

/** Source changes contain filesystem facts. Scenario sequencing belongs in TypeScript. */
export type SourceChangeOperation =
  | { move: { from: string; to: string } }
  | { delete: string }
  | { replaceText: { path: string; before: string; after: string; count?: number } }
  | { write: { path: string; contentFile: string } };

export interface SourceChangeDefinition {
  id: string;
  label: string;
  action: string;
  check: string;
  /** The single acceptance scenario responsible for verifying this change. */
  e2e: string;
  /** The first tag is the scenario's home in the development UI. */
  categories: SourceChangeCategory[];
  sourceGraph: string;
  operations: SourceChangeOperation[];
}

export interface SourceChangeStatus extends SourceChangeDefinition {
  state: 'available' | 'applied' | 'conflict';
  reason?: string;
  latestE2e?: {
    runId: string;
    scenario: string;
    url: string;
    /** The scenario's artifact directory name inside the run. */
    slug?: string;
    /** Checkpoints of that run, each openable as a saved state. */
    checkpoints?: SourceChangeCheckpoint[];
  };
}

export interface SourceChangeResult {
  changeId: string;
  sourceGraph: string;
  appliedAt: string;
  files: Array<{ path: string; beforeDigest: string | null; afterDigest: string | null }>;
}

/** A checkpoint listed beside a source change, in presentation form. */
export interface SourceChangeCheckpoint {
  index: number;
  message: string;
  openable: boolean;
  unavailableReason?: string;
  hostedAvailable: boolean;
  hostedUnavailableReason?: string;
}
