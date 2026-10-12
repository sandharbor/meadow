/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import { setTimeout as delay } from 'timers/promises';
import type {
  GeneratedBundleVersionEntry,
  GeneratedBundleVersionId,
} from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import type { GeneratedComparisonEndpoint } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputComparison.js';
import type { GeneratedOutputOwnership } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputIdentity.js';
import {
  generatedBundleVersionDirectory,
} from './generatedBundleVersionManifestService.js';
import {
  generatedTreeFiles,
  generatedTreeFilesAtCommit,
  readFileAtCommit,
} from './generatedBundleVersionGitService.js';
import { generatedBundleVersionOperationActive } from './generatedBundleVersionOperationLock.js';
import {
  classifyGenerationRecords,
  generationRecordPaths,
  hashGeneratedDirectory,
  readWorkingGenerationRecordSources,
  type ClassifiedGenerationRecords,
} from './generationRecords.js';

/** One side of a comparison: an exact generated tree with its matching records. */
export interface ResolvedComparisonEndpoint {
  endpoint: GeneratedComparisonEndpoint;
  files: Map<string, string>;
  owners: GeneratedOutputOwnership[] | null;
}

/** Comparison material that cannot be read is never treated as an empty site. */
export class GeneratedComparisonUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedComparisonUnavailableError';
  }
}

export function emptyComparisonEndpoint(): ResolvedComparisonEndpoint {
  return {
    endpoint: { kind: 'empty', versionId: null, commit: null, savedGenerationId: null, record: { kind: 'valid' } },
    files: new Map(),
    owners: [],
  };
}

function endpointFrom(
  kind: 'saved' | 'working',
  versionId: GeneratedBundleVersionId,
  commit: string | null,
  savedGenerationId: string | null,
  files: Map<string, string>,
  classified: ClassifiedGenerationRecords,
): ResolvedComparisonEndpoint {
  return {
    endpoint: { kind, versionId, commit, savedGenerationId, record: classified.state },
    files,
    owners: classified.state.kind === 'valid' ? classified.output!.output.owners : null,
  };
}

function recordSourcesAtCommit(bundleDirectory: string, commit: string, versionId: GeneratedBundleVersionId) {
  const paths = generationRecordPaths(bundleDirectory, versionId);
  return {
    inputs: readFileAtCommit(bundleDirectory, commit, paths.inputs)?.toString('utf8') ?? null,
    output: readFileAtCommit(bundleDirectory, commit, paths.output)?.toString('utf8') ?? null,
  };
}

/**
 * A saved result: generated files and records read from one resolved commit,
 * or from the retained tree of a version whose local files were deleted.
 */
export function resolveSavedEndpoint(
  bundleDirectory: string,
  commit: string,
  entry: GeneratedBundleVersionEntry,
): ResolvedComparisonEndpoint {
  let tree: { savedGenerationId: string; files: Map<string, string> } | null = null;
  if (entry.localFilesState === 'deleted') {
    try {
      tree = { savedGenerationId: entry.lastSavedGenerationId, files: generatedTreeFiles(bundleDirectory, entry.lastSavedGenerationId) };
    } catch {
      tree = null;
    }
  } else {
    tree = generatedTreeFilesAtCommit(bundleDirectory, commit, entry.versionId);
  }
  if (!tree) {
    throw new GeneratedComparisonUnavailableError(`The saved files for version ${entry.versionId} are not available for comparison.`);
  }
  const sources = recordSourcesAtCommit(bundleDirectory, commit, entry.versionId);
  return endpointFrom('saved', entry.versionId, commit, tree.savedGenerationId, tree.files,
    classifyGenerationRecords(sources.inputs, sources.output, tree.files));
}

const WORKING_READ_ATTEMPTS = 8;
const WORKING_RETRY_DELAY_MS = 150;

/**
 * The installed working result. A concurrent operation can replace the files
 * and records while they are read; detect that and read again rather than
 * pairing one generation's files with another generation's records.
 */
export async function resolveWorkingEndpoint(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): Promise<ResolvedComparisonEndpoint> {
  const directory = generatedBundleVersionDirectory(bundleDirectory, versionId);
  if (!fs.existsSync(directory)) {
    throw new GeneratedComparisonUnavailableError(`The generated files for version ${versionId} are missing.`);
  }
  let resolved: ResolvedComparisonEndpoint | null = null;
  for (let attempt = 0; attempt < WORKING_READ_ATTEMPTS; attempt++) {
    const before = readWorkingGenerationRecordSources(bundleDirectory, versionId);
    const files = await hashGeneratedDirectory(directory);
    const after = readWorkingGenerationRecordSources(bundleDirectory, versionId);
    const classified = classifyGenerationRecords(after.inputs, after.output, files);
    resolved = endpointFrom('working', versionId, null, null, files, classified);
    const stable = before.inputs === after.inputs && before.output === after.output;
    if (stable && (classified.state.kind !== 'corrupt' || !generatedBundleVersionOperationActive(bundleDirectory))) {
      return resolved;
    }
    await delay(WORKING_RETRY_DELAY_MS);
  }
  return resolved!;
}
