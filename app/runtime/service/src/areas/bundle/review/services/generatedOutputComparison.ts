/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import type { GeneratedBundleVersionEntry, GeneratedBundleVersionId, GeneratedBundleVersionManifest } from '../../../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import type { GeneratedComparisonBaseline, GeneratedOutputComparison } from '../../../../../../../contracts/types/areas/bundle/review/generatedOutputComparison.js';
import { generatedBundleVersionDirectory, loadGeneratedBundleVersionManifest } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { generatedTreeFilesAtCommit, hasGitRepository, readGitBlob, resolveHeadCommit } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { gitBlobId } from '../../../../shared/generated-bundle-versioning/generationRecords.js';
import { emptyComparisonEndpoint, GeneratedComparisonUnavailableError, resolveSavedEndpoint, resolveWorkingEndpoint, type ResolvedComparisonEndpoint } from '../../../../shared/generated-bundle-versioning/generatedOutputEndpoint.js';
import { pairGeneratedOutputs } from './generatedOutputPairing.js';

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
