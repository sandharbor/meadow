/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {
  GENERATED_BUNDLE_VERSION_ID_PATTERN,
  GENERATED_BUNDLE_VERSION_SCHEMA_VERSION,
  type DeletedGeneratedBundleVersionEntry,
  type GeneratedBundleVersionDerivedState,
  type GeneratedBundleVersionEntry,
  type GeneratedBundleVersionId,
  type GeneratedBundleVersionManifest,
  type PresentGeneratedBundleVersionEntry,
  type ReaderConnectionToPredecessor,
} from '../../../../shared_code/types/generatedBundleVersioning.js';

const ROOT_KEYS = new Set(['schemaVersion', 'versions']);
const BASE_ENTRY_KEYS = new Set([
  'versionId',
  'createdAt',
  'notes',
  'predecessorVersionId',
  'readerConnectionToPredecessor',
  'readerAwarenessState',
  'localFilesState',
]);
const TOMBSTONE_KEYS = new Set(['localFilesDeletedAt', 'lastSavedGenerationId']);
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export class GeneratedBundleVersionManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedBundleVersionManifestError';
  }
}

function fail(message: string): never {
  throw new GeneratedBundleVersionManifestError(message);
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: Set<string>, context: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${context} has unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
}

function requireCanonicalTimestamp(value: unknown, context: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${context} must be an ISO-8601 timestamp`);
  }
  const canonical = new Date(value).toISOString();
  if (canonical !== value) fail(`${context} must use canonical UTC millisecond form`);
  return value;
}

export function isGeneratedBundleVersionId(value: unknown): value is GeneratedBundleVersionId {
  return typeof value === 'string' && GENERATED_BUNDLE_VERSION_ID_PATTERN.test(value);
}

export function requireGeneratedBundleVersionId(value: unknown, context = 'versionId'): GeneratedBundleVersionId {
  if (!isGeneratedBundleVersionId(value)) {
    fail(`${context} must match ${GENERATED_BUNDLE_VERSION_ID_PATTERN.source}`);
  }
  return value;
}

function parseReaderConnection(value: unknown, context: string): ReaderConnectionToPredecessor {
  if (value !== 'connected' && value !== 'disconnected') {
    fail(`${context} must be connected or disconnected`);
  }
  return value;
}

function parseEntry(value: unknown, index: number): GeneratedBundleVersionEntry {
  const context = `versions[${index}]`;
  const record = requireRecord(value, context);
  const localFilesState = record.localFilesState;
  const allowed = new Set(BASE_ENTRY_KEYS);
  if (localFilesState === 'deleted') {
    for (const key of TOMBSTONE_KEYS) allowed.add(key);
  }
  rejectUnknownKeys(record, allowed, context);

  const versionId = requireGeneratedBundleVersionId(record.versionId, `${context}.versionId`);
  const createdAt = requireCanonicalTimestamp(record.createdAt, `${context}.createdAt`);
  if (typeof record.notes !== 'string') fail(`${context}.notes must be a string`);
  const notes = record.notes;
  const predecessorVersionId = record.predecessorVersionId === null
    ? null
    : requireGeneratedBundleVersionId(record.predecessorVersionId, `${context}.predecessorVersionId`);
  const readerConnectionToPredecessor = parseReaderConnection(
    record.readerConnectionToPredecessor,
    `${context}.readerConnectionToPredecessor`,
  );

  const readerAwarenessState = record.readerAwarenessState;
  if (readerAwarenessState !== undefined && readerAwarenessState !== 'legacy-incomplete') {
    fail(`${context}.readerAwarenessState must be legacy-incomplete when present`);
  }

  const base = {
    versionId,
    createdAt,
    notes,
    predecessorVersionId,
    readerConnectionToPredecessor,
    ...(readerAwarenessState === 'legacy-incomplete' ? { readerAwarenessState } : {}),
  };

  if (localFilesState === 'present') {
    return { ...base, localFilesState } as PresentGeneratedBundleVersionEntry;
  }
  if (localFilesState !== 'deleted') fail(`${context}.localFilesState must be present or deleted`);

  const localFilesDeletedAt = requireCanonicalTimestamp(
    record.localFilesDeletedAt,
    `${context}.localFilesDeletedAt`,
  );
  if (typeof record.lastSavedGenerationId !== 'string' || !GIT_OBJECT_ID_PATTERN.test(record.lastSavedGenerationId)) {
    fail(`${context}.lastSavedGenerationId must be a Git tree object ID`);
  }
  return {
    ...base,
    localFilesState,
    localFilesDeletedAt,
    lastSavedGenerationId: record.lastSavedGenerationId,
  } as DeletedGeneratedBundleVersionEntry;
}

export function parseGeneratedBundleVersionManifest(value: unknown): GeneratedBundleVersionManifest {
  const root = requireRecord(value, 'manifest');
  rejectUnknownKeys(root, ROOT_KEYS, 'manifest');
  if (root.schemaVersion !== GENERATED_BUNDLE_VERSION_SCHEMA_VERSION) {
    fail(`manifest.schemaVersion must be ${GENERATED_BUNDLE_VERSION_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(root.versions)) fail('manifest.versions must be an array');

  const versions = root.versions.map(parseEntry);
  const seenIds = new Set<string>();
  for (let index = 0; index < versions.length; index++) {
    const entry = versions[index];
    const foldedId = entry.versionId.toLowerCase();
    if (seenIds.has(foldedId)) fail(`versions contains duplicate or case-colliding ID ${entry.versionId}`);
    seenIds.add(foldedId);

    if (index === 0) {
      if (entry.predecessorVersionId !== null) fail('the first version must have a null predecessorVersionId');
      if (entry.readerConnectionToPredecessor !== 'disconnected') {
        fail('the first version must have a disconnected reader relationship');
      }
    } else {
      const expectedPredecessor = versions[index - 1].versionId;
      if (entry.predecessorVersionId !== expectedPredecessor) {
        fail(`${entry.versionId} must name immediate predecessor ${expectedPredecessor}`);
      }
    }
  }
  if (versions.length > 0 && versions[versions.length - 1].localFilesState !== 'present') {
    fail('the current (final) version must have local files present');
  }

  return { schemaVersion: GENERATED_BUNDLE_VERSION_SCHEMA_VERSION, versions };
}

export function emptyGeneratedBundleVersionManifest(): GeneratedBundleVersionManifest {
  return { schemaVersion: GENERATED_BUNDLE_VERSION_SCHEMA_VERSION, versions: [] };
}

export function currentGeneratedBundleVersion(
  manifest: GeneratedBundleVersionManifest,
): PresentGeneratedBundleVersionEntry | null {
  const entry = manifest.versions.at(-1);
  return (entry ?? null) as PresentGeneratedBundleVersionEntry | null;
}

export function deriveGeneratedBundleVersionState(
  manifest: GeneratedBundleVersionManifest,
  versionId: GeneratedBundleVersionId,
): GeneratedBundleVersionDerivedState {
  const index = manifest.versions.findIndex((entry) => entry.versionId === versionId);
  if (index < 0) fail(`unknown version ${versionId}`);
  const entry = manifest.versions[index];
  if (entry.localFilesState === 'deleted') return 'locally-deleted';
  return index === manifest.versions.length - 1 ? 'current' : 'frozen';
}

export function appendGeneratedBundleVersion(
  manifest: GeneratedBundleVersionManifest,
  input: {
    versionId: GeneratedBundleVersionId;
    createdAt: string;
    notes?: string;
    readerConnectionToPredecessor?: ReaderConnectionToPredecessor;
    readerAwarenessState?: 'legacy-incomplete';
  },
): GeneratedBundleVersionManifest {
  requireCanonicalTimestamp(input.createdAt, 'createdAt');
  if (manifest.versions.some((entry) => entry.versionId.toLowerCase() === input.versionId.toLowerCase())) {
    fail(`version ID ${input.versionId} collides with an existing version`);
  }
  const predecessor = manifest.versions.at(-1) ?? null;
  const entry: PresentGeneratedBundleVersionEntry = {
    versionId: input.versionId,
    createdAt: input.createdAt,
    notes: input.notes ?? '',
    predecessorVersionId: predecessor?.versionId ?? null,
    readerConnectionToPredecessor: predecessor
      ? (input.readerConnectionToPredecessor ?? 'connected')
      : 'disconnected',
    localFilesState: 'present',
    ...(input.readerAwarenessState ? { readerAwarenessState: input.readerAwarenessState } : {}),
  };
  return parseGeneratedBundleVersionManifest({
    schemaVersion: GENERATED_BUNDLE_VERSION_SCHEMA_VERSION,
    versions: [...manifest.versions, entry],
  });
}

export function updateGeneratedBundleVersionNote(
  manifest: GeneratedBundleVersionManifest,
  versionId: GeneratedBundleVersionId,
  notes: string,
): GeneratedBundleVersionManifest {
  let found = false;
  const versions = manifest.versions.map((entry) => {
    if (entry.versionId !== versionId) return entry;
    found = true;
    return { ...entry, notes };
  });
  if (!found) fail(`unknown version ${versionId}`);
  return { ...manifest, versions };
}

export function tombstoneGeneratedBundleVersion(
  manifest: GeneratedBundleVersionManifest,
  versionId: GeneratedBundleVersionId,
  input: { localFilesDeletedAt: string; lastSavedGenerationId: string },
): GeneratedBundleVersionManifest {
  const state = deriveGeneratedBundleVersionState(manifest, versionId);
  if (state !== 'frozen') fail('only a frozen version can have its local files deleted');
  let found = false;
  const versions = manifest.versions.map((entry): GeneratedBundleVersionEntry => {
    if (entry.versionId !== versionId) return entry;
    found = true;
    const tombstone: DeletedGeneratedBundleVersionEntry = {
      ...entry,
      localFilesState: 'deleted',
      localFilesDeletedAt: input.localFilesDeletedAt,
      lastSavedGenerationId: input.lastSavedGenerationId,
    };
    return tombstone;
  });
  if (!found) fail(`unknown version ${versionId}`);
  return parseGeneratedBundleVersionManifest({ ...manifest, versions });
}

export function cancelUnsavedCurrentVersion(
  manifest: GeneratedBundleVersionManifest,
  currentHasSavedGeneration: boolean,
): GeneratedBundleVersionManifest {
  if (manifest.versions.length === 0) fail('there is no current version to cancel');
  if (currentHasSavedGeneration) fail('a current version with a saved generation cannot be canceled');
  return { ...manifest, versions: manifest.versions.slice(0, -1) };
}
