/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Source changes contain filesystem facts. Scenario sequencing belongs in TypeScript. */
export type SourceChangeOperation =
  | { move: { from: string; to: string } }
  | { delete: string }
  | { replaceText: { path: string; before: string; after: string; count?: number } }
  | { write: { path: string; contentFile: string } };

export interface SourceChangeDefinition {
  id: string;
  label: string;
  description: string;
  sourceGraph: string;
  operations: SourceChangeOperation[];
}

export interface SourceChangeStatus extends SourceChangeDefinition {
  state: 'available' | 'applied' | 'conflict';
  reason?: string;
}

export interface SourceChangeResult {
  changeId: string;
  sourceGraph: string;
  appliedAt: string;
  files: Array<{ path: string; beforeDigest: string | null; afterDigest: string | null }>;
}
