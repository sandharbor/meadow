/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import type {
  GeneratedBundleVersionEntry,
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
} from '../../../../../contracts/types/generatedBundleVersioning.js';
import type {
  GeneratedComparisonBaseline,
  GeneratedComparisonEndpoint,
  GeneratedOutputComparison,
  GeneratedOutputOwnership,
} from '../../../../../contracts/types/generatedOutputIdentity.js';
import {
  generatedBundleVersionDirectory,
  loadGeneratedBundleVersionManifest,
} from './generatedBundleVersionManifestService.js';
import {
  generatedTreeFiles,
  generatedTreeFilesAtCommit,
  hasGitRepository,
  readFileAtCommit,
  readGitBlob,
  resolveHeadCommit,
} from './generatedBundleVersionGitService.js';
import { generatedBundleVersionOperationActive } from './generatedBundleVersionOperationLock.js';
import {
  classifyGenerationRecords,
  generationRecordPaths,
  gitBlobId,
  hashGeneratedDirectory,
  readWorkingGenerationRecordSources,
  type ClassifiedGenerationRecords,
} from './generationRecords.js';
import { pairGeneratedOutputs } from './generatedOutputPairing.js';

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

export interface ResolvedGeneratedComparison extends GeneratedOutputComparison {
  /** Absolute directory of the working endpoint, when one is compared. */
  workingDirectory: string | null;
}

function compare(
  left: ResolvedComparisonEndpoint,
  right: ResolvedComparisonEndpoint,
  baseline: GeneratedComparisonBaseline,
  workingDirectory: string | null,
): ResolvedGeneratedComparison {
  return {
    left: left.endpoint,
    right: right.endpoint,
    baseline,
    identityPairing: left.owners !== null && right.owners !== null,
    entries: pairGeneratedOutputs(
      { files: left.files, owners: left.owners },
      { files: right.files, owners: right.owners },
    ),
    workingDirectory,
  };
}

/**
 * Review's comparison for the current version. A saved current version
 * compares with its own saved result; a new version that has never been saved
 * compares with its predecessor's saved result; the first version compares
 * with an empty site.
 */
export async function compareCurrentGeneratedOutput(
  bundleDirectory: string,
  manifest: GeneratedBundleVersionManifest = loadGeneratedBundleVersionManifest(bundleDirectory),
): Promise<ResolvedGeneratedComparison | null> {
  const current = manifest.versions.at(-1);
  if (!current || current.localFilesState !== 'present') return null;
  const right = await resolveWorkingEndpoint(bundleDirectory, current.versionId);
  const workingDirectory = generatedBundleVersionDirectory(bundleDirectory, current.versionId);
  const commit = hasGitRepository(bundleDirectory) ? resolveHeadCommit(bundleDirectory) : null;
  if (commit && generatedTreeFilesAtCommit(bundleDirectory, commit, current.versionId)) {
    return compare(resolveSavedEndpoint(bundleDirectory, commit, current), right, 'saved-current', workingDirectory);
  }
  const predecessor = manifest.versions.at(-2);
  if (!predecessor) return compare(emptyComparisonEndpoint(), right, 'empty', workingDirectory);
  if (!commit) {
    throw new GeneratedComparisonUnavailableError(`The saved files for version ${predecessor.versionId} are not available for comparison.`);
  }
  return compare(resolveSavedEndpoint(bundleDirectory, commit, predecessor), right, 'saved-predecessor', workingDirectory);
}

/** Explicit Versions comparison between a saved result and a saved or working result. */
export async function compareSelectedGeneratedVersions(
  bundleDirectory: string,
  leftVersionId: GeneratedBundleVersionId,
  right: { versionId: GeneratedBundleVersionId } | { workingCurrentVersionId: GeneratedBundleVersionId },
  manifest: GeneratedBundleVersionManifest = loadGeneratedBundleVersionManifest(bundleDirectory),
): Promise<ResolvedGeneratedComparison> {
  const commit = hasGitRepository(bundleDirectory) ? resolveHeadCommit(bundleDirectory) : null;
  const entryFor = (versionId: GeneratedBundleVersionId): GeneratedBundleVersionEntry => {
    const entry = manifest.versions.find(candidate => candidate.versionId === versionId);
    if (!entry) throw new GeneratedComparisonUnavailableError(`Unknown generated bundle version ${versionId}`);
    return entry;
  };
  if (!commit) throw new GeneratedComparisonUnavailableError('Saved versions are not available without Meadow Home versioning.');
  const left = resolveSavedEndpoint(bundleDirectory, commit, entryFor(leftVersionId));
  if ('workingCurrentVersionId' in right) {
    return compare(left, await resolveWorkingEndpoint(bundleDirectory, right.workingCurrentVersionId), 'selected',
      generatedBundleVersionDirectory(bundleDirectory, right.workingCurrentVersionId));
  }
  return compare(left, resolveSavedEndpoint(bundleDirectory, commit, entryFor(right.versionId)), 'selected', null);
}

export class StaleGeneratedComparisonError extends Error {
  constructor() {
    super('The generated file changed since this comparison was computed. Refresh the comparison.');
    this.name = 'StaleGeneratedComparisonError';
  }
}

/**
 * Exact bytes of one side of a comparison entry. Saved bytes come from their
 * blob, never from whatever file now occupies the old path.
 */
export function readComparedGeneratedFile(
  bundleDirectory: string,
  reference: { endpointKind: 'saved' | 'working'; versionId: GeneratedBundleVersionId | null; path: string; objectId: string },
): Buffer {
  if (reference.endpointKind === 'saved') {
    const content = readGitBlob(bundleDirectory, reference.objectId);
    if (!content) throw new GeneratedComparisonUnavailableError('The saved file is no longer available.');
    return content;
  }
  if (!reference.versionId) throw new StaleGeneratedComparisonError();
  const root = generatedBundleVersionDirectory(bundleDirectory, reference.versionId);
  const filePath = path.resolve(root, ...reference.path.split('/'));
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new StaleGeneratedComparisonError();
  let content: Buffer;
  try {
    content = fs.readFileSync(filePath);
  } catch {
    throw new StaleGeneratedComparisonError();
  }
  if (gitBlobId(content) !== reference.objectId) throw new StaleGeneratedComparisonError();
  return content;
}
