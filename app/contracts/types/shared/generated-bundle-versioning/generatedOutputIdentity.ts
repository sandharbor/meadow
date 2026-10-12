/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from '../bundle-graph/bundleNodeConfig.js';

/**
 * Stable purpose of a source-backed generated file. A role never derives from
 * the file's name, directory, version prefix, or contents.
 */
export type GeneratedOutputRole = 'page' | 'drawing-data' | 'asset' | 'structural-preview';

export const GENERATED_OUTPUT_ROLES: readonly GeneratedOutputRole[] = ['page', 'drawing-data', 'asset', 'structural-preview'];

/** One emitted file's recorded logical identity: its owner plus role. */
export interface GeneratedOutputOwnership {
  /** Path relative to the generated version root. */
  path: string;
  bundleNodeId: BundleNodeId;
  role: GeneratedOutputRole;
}

/** An original captured source file admitted to a generated result. */
export interface IncludedSourceEntry {
  /** Registered source identity, or null for a legacy single-source bundle. */
  sourceId: string | null;
  /** Path relative to its source root inside the accepted snapshot. */
  path: string;
  bundleNodeId: BundleNodeId | null;
}

export const GENERATION_INPUT_RECORD_SCHEMA_VERSION = 2 as const;
export const GENERATION_OUTPUT_RECORD_SCHEMA_VERSION = 1 as const;

/**
 * The accepted inputs captured when a generation starts. Records written
 * before output identity existed have no schemaVersion or generationId.
 */
export interface GenerationInputRecord {
  schemaVersion: typeof GENERATION_INPUT_RECORD_SCHEMA_VERSION;
  /** Unique per generation; binds this record to its output record. */
  generationId: string;
  sourceSnapshotId: string;
  bundleConfig: unknown;
  nodeConfig: string;
  appConfig: unknown;
}

/**
 * What a generation emitted, bound to the exact generated file set by a
 * fingerprint of its relative paths and Git blob IDs. It is local metadata:
 * never a file of the generated website.
 */
export interface GenerationOutputRecord {
  schemaVersion: typeof GENERATION_OUTPUT_RECORD_SCHEMA_VERSION;
  generationId: string;
  output: {
    fingerprint: string;
    fileCount: number;
    owners: GeneratedOutputOwnership[];
  };
  includedSources: IncludedSourceEntry[];
}

/** How much a comparison endpoint's metadata can be trusted for identity. */
export type GenerationRecordState =
  | { kind: 'valid' }
  | { kind: 'legacy' }
  | { kind: 'unsupported'; diagnostic: string }
  | { kind: 'corrupt'; diagnostic: string };
