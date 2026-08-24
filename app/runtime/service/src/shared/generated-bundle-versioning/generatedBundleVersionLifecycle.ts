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

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  GeneratedBundleVersionEntry,
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
  PresentGeneratedBundleVersionEntry,
  ReaderConnectionToPredecessor,
} from '../../../../../contracts/types/generatedBundleVersioning.js';
import {
  appendGeneratedBundleVersion,
  cancelUnsavedCurrentVersion,
  currentGeneratedBundleVersion,
  parseGeneratedBundleVersionManifest,
  tombstoneGeneratedBundleVersion,
  updateGeneratedBundleVersionNote,
} from './generatedBundleVersionDomain.js';
import {
  generateGeneratedBundleVersionId,
  generatedBundleVersionManifestPath,
  generatedBundleVersionDirectory,
  generatedBundleVersionsRoot,
  loadGeneratedBundleVersionManifest,
  saveGeneratedBundleVersionManifest,
} from './generatedBundleVersionManifestService.js';
import {
  deriveSavedGenerationId,
  inspectGeneratedVersionGitState,
  restoreGeneratedVersionFromGit,
  type GeneratedVersionGitChange,
} from './generatedBundleVersionGitService.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  textDocumentCodec,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';

type VersionOperationType = 'generate-current' | 'create-version';
type VersionOperationPhase = 'staging' | 'predecessor-backed-up' | 'version-installed' | 'manifest-committed';

interface VersionOperationJournal {
  schemaVersion: 1;
  operationId: string;
  operationType: VersionOperationType;
  phase: VersionOperationPhase;
  versionId: GeneratedBundleVersionId;
  predecessorVersionId: GeneratedBundleVersionId | null;
  stagingDirectoryName: string;
  backupDirectoryName: string | null;
}

export interface FrozenVersionIntegrityProblem {
  versionId: GeneratedBundleVersionId;
  changes: GeneratedVersionGitChange[];
}

export interface VersionRecoveryProblem {
  kind: 'quarantined-unreferenced-version' | 'missing-present-version-directory';
  versionId: GeneratedBundleVersionId;
  path: string;
}

export interface VersionRecoveryResult {
  recoveredOperation: boolean;
  removedStagingDirectories: string[];
  problems: VersionRecoveryProblem[];
}

export interface VersionLifecycleResult {
  operationId: string;
  versionId: GeneratedBundleVersionId;
  directory: string;
  created: boolean;
  manifest: GeneratedBundleVersionManifest;
}

export class FrozenVersionIntegrityError extends Error {
  constructor(readonly problems: FrozenVersionIntegrityProblem[]) {
    super(`Frozen version modified locally: ${problems.map((problem) => problem.versionId).join(', ')}`);
    this.name = 'FrozenVersionIntegrityError';
  }
}

export class VersionCreationNeedsRecoveryError extends Error {
  constructor(readonly problems: VersionRecoveryProblem[]) {
    super('Version creation needs recovery');
    this.name = 'VersionCreationNeedsRecoveryError';
  }
}

export class SimulatedVersionOperationCrash extends Error {
  readonly leaveOperationForRecovery = true;
}

interface LifecycleDependencies {
  now?: () => Date;
  operationId?: () => string;
  randomBytes?: (size: number) => Buffer;
  onPhase?: (phase: VersionOperationPhase) => void;
}

interface GenerateOptions extends LifecycleDependencies {
  generate: (stagingDirectory: string) => Promise<void>;
  validate?: (stagingDirectory: string) => void | Promise<void>;
}

interface CreateVersionOptions extends GenerateOptions {
  notes?: string;
  readerConnectionToPredecessor?: ReaderConnectionToPredecessor;
  confirmedNoGeneratedChanges?: boolean;
}

interface ManifestSnapshot {
  manifest: GeneratedBundleVersionManifest;
  existed: boolean;
  content: string | null;
}

const JOURNAL_FILENAME = '.version-operation.json';
const LOCK_FILENAME = '.version-operation.lock';
const STAGING_PREFIX = '.staging-';
const BACKUP_PREFIX = '.backup-';
const QUARANTINE_PREFIX = '.quarantine-';
const journalCodec = jsonDocumentCodec<VersionOperationJournal>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  const fields = new Set([
    'schemaVersion',
    'operationId',
    'operationType',
    'phase',
    'versionId',
    'predecessorVersionId',
    'stagingDirectoryName',
    'backupDirectoryName',
  ]);
  const unknown = Object.keys(value).find(field => !fields.has(field));
  if (unknown) return { valid: false, diagnostic: `$.${unknown} is not supported` };
  if (value.schemaVersion !== 1) return { valid: false, diagnostic: '$.schemaVersion must be 1' };
  if (!['generate-current', 'create-version'].includes(String(value.operationType))) {
    return { valid: false, diagnostic: '$.operationType is invalid' };
  }
  if (!['staging', 'predecessor-backed-up', 'version-installed', 'manifest-committed'].includes(String(value.phase))) {
    return { valid: false, diagnostic: '$.phase is invalid' };
  }
  for (const field of ['operationId', 'versionId', 'stagingDirectoryName']) {
    if (typeof value[field] !== 'string') return { valid: false, diagnostic: `$.${field} must be a string` };
  }
  for (const field of ['predecessorVersionId', 'backupDirectoryName']) {
    if (value[field] !== null && typeof value[field] !== 'string') {
      return { valid: false, diagnostic: `$.${field} must be a string or null` };
    }
  }
  return { valid: true, value: value as unknown as VersionOperationJournal };
});

function journalPath(bundleDirectory: string): string {
  return path.join(generatedBundleVersionsRoot(bundleDirectory), JOURNAL_FILENAME);
}

function lockPath(bundleDirectory: string): string {
  return path.join(generatedBundleVersionsRoot(bundleDirectory), LOCK_FILENAME);
}

function writeJournal(bundleDirectory: string, journal: VersionOperationJournal): void {
  writeDurableDocument({ path: journalPath(bundleDirectory), value: journal, codec: journalCodec });
}

function readJournal(bundleDirectory: string): VersionOperationJournal | null {
  const filePath = journalPath(bundleDirectory);
  const result = readDurableDocument(filePath, journalCodec);
  if (result.status === 'missing') return null;
  return requireValidDocument(result, () => {
    throw new Error('Generated bundle version journal disappeared');
  });
}

function updateJournalPhase(
  bundleDirectory: string,
  journal: VersionOperationJournal,
  phase: VersionOperationPhase,
  onPhase?: (phase: VersionOperationPhase) => void,
): void {
  journal.phase = phase;
  writeJournal(bundleDirectory, journal);
  onPhase?.(phase);
}

function withOperationLock<T>(bundleDirectory: string, operation: () => T | Promise<T>): Promise<T> {
  const root = generatedBundleVersionsRoot(bundleDirectory);
  fs.mkdirSync(root, { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath(bundleDirectory), 'wx');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw new Error('A conflicting bundle versioning operation is already running');
    throw error;
  }
  const release = () => {
    fs.closeSync(descriptor);
    fs.rmSync(lockPath(bundleDirectory), { force: true });
  };
  try {
    return Promise.resolve(operation()).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}

function containsGeneratedHtml(directory: string): boolean {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && containsGeneratedHtml(fullPath)) return true;
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) return true;
  }
  return false;
}

async function validateStagedGeneration(
  stagingDirectory: string,
  validate?: (stagingDirectory: string) => void | Promise<void>,
): Promise<void> {
  if (!fs.existsSync(stagingDirectory) || !fs.statSync(stagingDirectory).isDirectory()) {
    throw new Error('Generation did not create its staging directory');
  }
  if (!containsGeneratedHtml(stagingDirectory)) throw new Error('Generated bundle contains no HTML pages');
  await validate?.(stagingDirectory);
}

function frozenIntegrityProblems(
  bundleDirectory: string,
  manifest: GeneratedBundleVersionManifest,
): FrozenVersionIntegrityProblem[] {
  const problems: FrozenVersionIntegrityProblem[] = [];
  for (const entry of manifest.versions.slice(0, -1)) {
    if (entry.localFilesState === 'deleted') continue;
    const state = inspectGeneratedVersionGitState(bundleDirectory, entry.versionId);
    if (!state.isSaved) problems.push({ versionId: entry.versionId, changes: state.changes });
  }
  return problems;
}

export function assertFrozenGeneratedVersionsIntegrity(
  bundleDirectory: string,
  manifest = loadGeneratedBundleVersionManifest(bundleDirectory),
): void {
  const problems = frozenIntegrityProblems(bundleDirectory, manifest);
  if (problems.length > 0) throw new FrozenVersionIntegrityError(problems);
}

export function inspectFrozenGeneratedVersionsIntegrity(
  bundleDirectory: string,
  manifest = loadGeneratedBundleVersionManifest(bundleDirectory),
): FrozenVersionIntegrityProblem[] {
  return frozenIntegrityProblems(bundleDirectory, manifest);
}

function withoutLegacyAwarenessMarker(
  manifest: GeneratedBundleVersionManifest,
): GeneratedBundleVersionManifest {
  if (manifest.versions.length === 0) return manifest;
  const versions = manifest.versions.map((entry, index): GeneratedBundleVersionEntry => {
    if (index !== manifest.versions.length - 1 || entry.readerAwarenessState !== 'legacy-incomplete') return entry;
    const readyEntry: GeneratedBundleVersionEntry = { ...entry };
    delete readyEntry.readerAwarenessState;
    return readyEntry;
  });
  return parseGeneratedBundleVersionManifest({ ...manifest, versions });
}

function cleanupOperationArtifacts(bundleDirectory: string, journal: VersionOperationJournal): void {
  const root = generatedBundleVersionsRoot(bundleDirectory);
  fs.rmSync(path.join(root, journal.stagingDirectoryName), { recursive: true, force: true });
  if (journal.backupDirectoryName) {
    fs.rmSync(path.join(root, journal.backupDirectoryName), { recursive: true, force: true });
  }
  fs.rmSync(journalPath(bundleDirectory), { force: true });
}

function captureManifestSnapshot(bundleDirectory: string): ManifestSnapshot {
  const filePath = generatedBundleVersionManifestPath(bundleDirectory);
  const existed = fs.existsSync(filePath);
  return {
    manifest: loadGeneratedBundleVersionManifest(bundleDirectory),
    existed,
    content: existed ? fs.readFileSync(filePath, 'utf8') : null,
  };
}

function restoreManifestSnapshot(bundleDirectory: string, snapshot: ManifestSnapshot): void {
  const filePath = generatedBundleVersionManifestPath(bundleDirectory);
  if (!snapshot.existed) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  writeDurableDocument({
    path: filePath,
    value: snapshot.content!,
    codec: textDocumentCodec,
  });
}

function rollbackSynchronousFailure(
  bundleDirectory: string,
  journal: VersionOperationJournal,
  manifestBefore: ManifestSnapshot,
): void {
  const root = generatedBundleVersionsRoot(bundleDirectory);
  const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, journal.versionId);
  const backupDirectory = journal.backupDirectoryName ? path.join(root, journal.backupDirectoryName) : null;

  if (journal.operationType === 'create-version') {
    fs.rmSync(installedDirectory, { recursive: true, force: true });
    if (backupDirectory && journal.predecessorVersionId && fs.existsSync(backupDirectory)) {
      const predecessorDirectory = generatedBundleVersionDirectory(bundleDirectory, journal.predecessorVersionId);
      fs.rmSync(predecessorDirectory, { recursive: true, force: true });
      fs.renameSync(backupDirectory, predecessorDirectory);
    }
  } else if (backupDirectory && fs.existsSync(backupDirectory)) {
    fs.rmSync(installedDirectory, { recursive: true, force: true });
    fs.renameSync(backupDirectory, installedDirectory);
  } else if (!backupDirectory) {
    fs.rmSync(installedDirectory, { recursive: true, force: true });
  }

  restoreManifestSnapshot(bundleDirectory, manifestBefore);
  cleanupOperationArtifacts(bundleDirectory, journal);
}

function buildJournal(
  operationType: VersionOperationType,
  operationId: string,
  versionId: GeneratedBundleVersionId,
  predecessorVersionId: GeneratedBundleVersionId | null,
  hasBackup: boolean,
): VersionOperationJournal {
  return {
    schemaVersion: 1,
    operationId,
    operationType,
    phase: 'staging',
    versionId,
    predecessorVersionId,
    stagingDirectoryName: `${STAGING_PREFIX}${operationId}-${versionId}`,
    backupDirectoryName: hasBackup ? `${BACKUP_PREFIX}${operationId}-${predecessorVersionId ?? versionId}` : null,
  };
}

export async function generateCurrentBundleVersion(
  bundleDirectory: string,
  options: GenerateOptions,
): Promise<VersionLifecycleResult> {
  return withOperationLock(bundleDirectory, async () => {
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory, { preserveOperationLock: true });
    if (recovery.problems.length > 0) throw new VersionCreationNeedsRecoveryError(recovery.problems);
    const manifestSnapshot = captureManifestSnapshot(bundleDirectory);
    const manifestBefore = manifestSnapshot.manifest;
    assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifestBefore);
    const existingCurrent = currentGeneratedBundleVersion(manifestBefore);
    const versionId = existingCurrent?.versionId ?? generateGeneratedBundleVersionId(
      manifestBefore.versions.map((entry) => entry.versionId),
      { randomBytes: options.randomBytes },
    );
    const operationId = options.operationId?.() ?? randomUUID();
    const journal = buildJournal('generate-current', operationId, versionId, null, existingCurrent !== null);
    const root = generatedBundleVersionsRoot(bundleDirectory);
    const stagingDirectory = path.join(root, journal.stagingDirectoryName);
    const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
    const backupDirectory = journal.backupDirectoryName ? path.join(root, journal.backupDirectoryName) : null;
    writeJournal(bundleDirectory, journal);

    try {
      options.onPhase?.('staging');
      await options.generate(stagingDirectory);
      await validateStagedGeneration(stagingDirectory, options.validate);
      if (existingCurrent && backupDirectory) {
        fs.renameSync(installedDirectory, backupDirectory);
        updateJournalPhase(bundleDirectory, journal, 'predecessor-backed-up', options.onPhase);
      }
      fs.renameSync(stagingDirectory, installedDirectory);
      updateJournalPhase(bundleDirectory, journal, 'version-installed', options.onPhase);

      let manifestAfter = existingCurrent
        ? withoutLegacyAwarenessMarker(manifestBefore)
        : appendGeneratedBundleVersion(manifestBefore, {
          versionId,
          createdAt: (options.now?.() ?? new Date()).toISOString(),
        });
      saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
      updateJournalPhase(bundleDirectory, journal, 'manifest-committed', options.onPhase);
      manifestAfter = loadGeneratedBundleVersionManifest(bundleDirectory);
      cleanupOperationArtifacts(bundleDirectory, journal);
      return { operationId, versionId, directory: installedDirectory, created: existingCurrent === null, manifest: manifestAfter };
    } catch (error) {
      if ((error as { leaveOperationForRecovery?: boolean }).leaveOperationForRecovery !== true) {
        rollbackSynchronousFailure(bundleDirectory, journal, manifestSnapshot);
      }
      throw error;
    }
  });
}

export async function createNewGeneratedBundleVersion(
  bundleDirectory: string,
  options: CreateVersionOptions,
): Promise<VersionLifecycleResult> {
  return withOperationLock(bundleDirectory, async () => {
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory, { preserveOperationLock: true });
    if (recovery.problems.length > 0) throw new VersionCreationNeedsRecoveryError(recovery.problems);
    const manifestSnapshot = captureManifestSnapshot(bundleDirectory);
    const manifestBefore = manifestSnapshot.manifest;
    const current = currentGeneratedBundleVersion(manifestBefore);
    if (!current) throw new Error('Generate and save the first version before creating another version');
    assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifestBefore);

    const currentState = inspectGeneratedVersionGitState(bundleDirectory, current.versionId);
    if (currentState.savedGenerationId === null) {
      throw new Error('The current version must have at least one saved generation');
    }
    if (currentState.changes.length === 0 && options.confirmedNoGeneratedChanges !== true) {
      throw new Error('Creating a version with no generated changes requires confirmation');
    }
    const connection = options.readerConnectionToPredecessor ?? 'connected';
    if (connection === 'connected' && current.readerAwarenessState === 'legacy-incomplete') {
      throw new Error('Regenerate and save the current version before creating a connected successor');
    }

    const versionId = generateGeneratedBundleVersionId(
      manifestBefore.versions.map((entry) => entry.versionId),
      { randomBytes: options.randomBytes },
    );
    const operationId = options.operationId?.() ?? randomUUID();
    const journal = buildJournal('create-version', operationId, versionId, current.versionId, true);
    const root = generatedBundleVersionsRoot(bundleDirectory);
    const stagingDirectory = path.join(root, journal.stagingDirectoryName);
    const backupDirectory = path.join(root, journal.backupDirectoryName!);
    const predecessorDirectory = generatedBundleVersionDirectory(bundleDirectory, current.versionId);
    const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
    writeJournal(bundleDirectory, journal);

    try {
      options.onPhase?.('staging');
      await options.generate(stagingDirectory);
      await validateStagedGeneration(stagingDirectory, options.validate);
      fs.cpSync(predecessorDirectory, backupDirectory, { recursive: true, force: false });
      updateJournalPhase(bundleDirectory, journal, 'predecessor-backed-up', options.onPhase);
      restoreGeneratedVersionFromGit(bundleDirectory, current.versionId);
      fs.renameSync(stagingDirectory, installedDirectory);
      updateJournalPhase(bundleDirectory, journal, 'version-installed', options.onPhase);

      const manifestAfter = appendGeneratedBundleVersion(manifestBefore, {
        versionId,
        createdAt: (options.now?.() ?? new Date()).toISOString(),
        notes: options.notes ?? '',
        readerConnectionToPredecessor: connection,
      });
      saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
      updateJournalPhase(bundleDirectory, journal, 'manifest-committed', options.onPhase);
      cleanupOperationArtifacts(bundleDirectory, journal);
      return { operationId, versionId, directory: installedDirectory, created: true, manifest: manifestAfter };
    } catch (error) {
      if ((error as { leaveOperationForRecovery?: boolean }).leaveOperationForRecovery !== true) {
        rollbackSynchronousFailure(bundleDirectory, journal, manifestSnapshot);
      }
      throw error;
    }
  });
}

export function cancelCurrentGeneratedBundleVersion(bundleDirectory: string): GeneratedBundleVersionManifest {
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const current = currentGeneratedBundleVersion(manifest);
  if (!current) throw new Error('There is no current version to cancel');
  assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifest);
  const savedGenerationId = deriveSavedGenerationId(bundleDirectory, current.versionId);
  const manifestAfter = cancelUnsavedCurrentVersion(manifest, savedGenerationId !== null);
  fs.rmSync(generatedBundleVersionDirectory(bundleDirectory, current.versionId), { recursive: true, force: true });
  saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
  return manifestAfter;
}

export function updateGeneratedBundleVersionNotes(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
  notes: string,
): GeneratedBundleVersionManifest {
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const manifestAfter = updateGeneratedBundleVersionNote(manifest, versionId, notes);
  saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
  return manifestAfter;
}

export async function deleteLocalGeneratedBundleVersionFiles(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
  dependencies: Pick<LifecycleDependencies, 'now' | 'operationId'> = {},
): Promise<GeneratedBundleVersionManifest> {
  return withOperationLock(bundleDirectory, () => {
    const recovery = recoverGeneratedBundleVersionOperations(bundleDirectory, { preserveOperationLock: true });
    if (recovery.problems.length > 0) throw new VersionCreationNeedsRecoveryError(recovery.problems);
    const manifestSnapshot = captureManifestSnapshot(bundleDirectory);
    const manifestBefore = manifestSnapshot.manifest;
    assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifestBefore);
    const entry = manifestBefore.versions.find(candidate => candidate.versionId === versionId);
    if (!entry) throw new Error(`Unknown generated bundle version ${versionId}`);
    if (entry.localFilesState === 'deleted') return manifestBefore;
    if (manifestBefore.versions.at(-1)?.versionId === versionId) {
      throw new Error('The current version cannot have its local files deleted');
    }
    const savedGenerationId = deriveSavedGenerationId(bundleDirectory, versionId);
    if (!savedGenerationId) throw new Error('The frozen version must have a saved generation before local deletion');

    const versionDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
    const backupDirectory = path.join(
      generatedBundleVersionsRoot(bundleDirectory),
      `${BACKUP_PREFIX}delete-${dependencies.operationId?.() ?? randomUUID()}-${versionId}`,
    );
    fs.renameSync(versionDirectory, backupDirectory);
    try {
      const manifestAfter = tombstoneGeneratedBundleVersion(manifestBefore, versionId, {
        localFilesDeletedAt: (dependencies.now?.() ?? new Date()).toISOString(),
        lastSavedGenerationId: savedGenerationId,
      });
      saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
      fs.rmSync(backupDirectory, { recursive: true, force: true });
      return manifestAfter;
    } catch (error) {
      restoreManifestSnapshot(bundleDirectory, manifestSnapshot);
      if (fs.existsSync(backupDirectory)) fs.renameSync(backupDirectory, versionDirectory);
      throw error;
    }
  });
}

export function restoreFrozenGeneratedBundleVersion(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): void {
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const entryIndex = manifest.versions.findIndex(entry => entry.versionId === versionId);
  if (entryIndex < 0) throw new Error(`Unknown generated bundle version ${versionId}`);
  if (entryIndex === manifest.versions.length - 1) throw new Error('The current version is not frozen');
  if (manifest.versions[entryIndex].localFilesState === 'deleted') {
    throw new Error('A locally deleted version has no files to restore');
  }
  restoreGeneratedVersionFromGit(bundleDirectory, versionId);
}

function validVersionDirectories(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v[A-Za-z0-9]{6}$/.test(entry.name))
    .map((entry) => entry.name);
}

export function recoverGeneratedBundleVersionOperations(
  bundleDirectory: string,
  options: { preserveOperationLock?: boolean } = {},
): VersionRecoveryResult {
  const root = generatedBundleVersionsRoot(bundleDirectory);
  fs.mkdirSync(root, { recursive: true });
  if (!options.preserveOperationLock) fs.rmSync(lockPath(bundleDirectory), { force: true });
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const journal = readJournal(bundleDirectory);
  let recoveredOperation = false;

  if (journal) {
    const namedInManifest = manifest.versions.some((entry) => entry.versionId === journal.versionId);
    const completed = journal.phase === 'manifest-committed'
      || (namedInManifest && journal.operationType === 'create-version')
      || (namedInManifest && journal.operationType === 'generate-current' && journal.predecessorVersionId === null
        && !journal.backupDirectoryName);
    if (completed) {
      cleanupOperationArtifacts(bundleDirectory, journal);
    } else {
      const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, journal.versionId);
      fs.rmSync(installedDirectory, { recursive: true, force: true });
      if (journal.backupDirectoryName) {
        const backupDirectory = path.join(root, journal.backupDirectoryName);
        const restoreVersionId = journal.operationType === 'create-version'
          ? journal.predecessorVersionId
          : journal.versionId;
        if (restoreVersionId && fs.existsSync(backupDirectory)) {
          const restoreDirectory = generatedBundleVersionDirectory(bundleDirectory, restoreVersionId);
          fs.rmSync(restoreDirectory, { recursive: true, force: true });
          fs.renameSync(backupDirectory, restoreDirectory);
        }
      }
      cleanupOperationArtifacts(bundleDirectory, journal);
    }
    recoveredOperation = true;
  }

  const removedStagingDirectories: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(STAGING_PREFIX)) {
      const fullPath = path.join(root, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true });
      removedStagingDirectories.push(fullPath);
    }
  }

  const problems: VersionRecoveryProblem[] = [];
  const manifestIds = new Set(manifest.versions.map((entry) => entry.versionId));
  for (const versionDirectoryName of validVersionDirectories(root)) {
    if (manifestIds.has(versionDirectoryName as GeneratedBundleVersionId)) continue;
    const sourcePath = path.join(root, versionDirectoryName);
    const quarantinePath = path.join(root, `${QUARANTINE_PREFIX}${versionDirectoryName}-${randomUUID()}`);
    fs.renameSync(sourcePath, quarantinePath);
    problems.push({
      kind: 'quarantined-unreferenced-version',
      versionId: versionDirectoryName as GeneratedBundleVersionId,
      path: quarantinePath,
    });
  }
  for (const entry of manifest.versions) {
    if (entry.localFilesState === 'deleted') continue;
    const directory = generatedBundleVersionDirectory(bundleDirectory, entry.versionId);
    if (!fs.existsSync(directory)) {
      problems.push({ kind: 'missing-present-version-directory', versionId: entry.versionId, path: directory });
    }
  }
  return { recoveredOperation, removedStagingDirectories, problems };
}

export function currentVersionEntry(
  bundleDirectory: string,
): PresentGeneratedBundleVersionEntry | null {
  return currentGeneratedBundleVersion(loadGeneratedBundleVersionManifest(bundleDirectory));
}
