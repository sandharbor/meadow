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
} from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
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
  hasGitRepository,
  inspectGeneratedVersionGitState,
  restoreGeneratedVersionFromGit,
  restoreGenerationRecordsFromHead,
  type GeneratedVersionGitChange,
} from './generatedBundleVersionGitService.js';
import {
  generatedBundleVersionOperationsDirectory,
  releaseGeneratedBundleVersionOperationLock,
  withGeneratedBundleVersionOperation,
} from './generatedBundleVersionOperationLock.js';
import {
  journalArtifactRoot,
  readJournal,
  removeJournal,
  writeJournal,
  type AnyVersionOperationJournal,
  type VersionOperationJournal,
  type VersionOperationPhase,
  type VersionOperationType,
} from './generatedBundleVersionJournal.js';
import {
  backupGenerationRecords,
  installStagedGenerationRecords,
  priorGenerationRecords,
  removeGenerationRecords,
  restoreGenerationRecordsFromBackup,
  stageGenerationRecords,
} from './generationRecordInstallation.js';
import {
  buildGenerationRecordPair,
  hashGeneratedDirectory,
  type CapturedGenerationInputs,
  type EmittedGenerationOutput,
} from './generationRecords.js';
import {
  textDocumentCodec,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

export { GeneratedBundleVersionOperationConflictError, withGeneratedBundleVersionOperation } from './generatedBundleVersionOperationLock.js';

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
  /** Identity of the installed output/record pair. */
  generationId: string;
}

/** What a generation reports so its output can be installed with matching records. */
export interface GeneratedResultMetadata {
  captured: CapturedGenerationInputs;
  emitted: EmittedGenerationOutput;
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
  generate: (stagingDirectory: string) => Promise<GeneratedResultMetadata>;
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

const STAGING_PREFIX = 'staging-';
const BACKUP_PREFIX = 'backup-';
const QUARANTINE_PREFIX = 'quarantine-';
const LEGACY_STAGING_PREFIX = '.staging-';
const LEGACY_LOCK_FILENAME = '.version-operation.lock';

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
    if (state.savedGenerationId === null || state.changes.length > 0 || !fs.existsSync(generatedBundleVersionDirectory(bundleDirectory, entry.versionId))) {
      problems.push({ versionId: entry.versionId, changes: state.changes });
    }
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

/**
 * A frozen version's records must equal its saved records. Earlier releases
 * could leave a newer working record beside a restored predecessor; return
 * such metadata to the saved pair instead of describing frozen output with
 * another generation's provenance.
 */
export function restoreFrozenGenerationRecords(
  bundleDirectory: string,
  manifest = loadGeneratedBundleVersionManifest(bundleDirectory),
): void {
  if (manifest.versions.length < 2 || !hasGitRepository(bundleDirectory)) return;
  for (const entry of manifest.versions.slice(0, -1)) {
    const state = inspectGeneratedVersionGitState(bundleDirectory, entry.versionId);
    if (state.recordChanges.length === 0) continue;
    if (entry.localFilesState === 'present' && state.savedGenerationId === null) continue;
    restoreGenerationRecordsFromHead(bundleDirectory, entry.versionId);
    logger.info(`[generated-versions] Restored saved generation records for frozen version ${entry.versionId}`);
  }
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

function cleanupOperationArtifacts(bundleDirectory: string, journal: AnyVersionOperationJournal): void {
  const root = journalArtifactRoot(bundleDirectory, journal);
  fs.rmSync(path.join(root, journal.stagingDirectoryName), { recursive: true, force: true });
  if (journal.backupDirectoryName) {
    fs.rmSync(path.join(root, journal.backupDirectoryName), { recursive: true, force: true });
  }
  if (journal.schemaVersion === 2) {
    fs.rmSync(path.join(root, journal.recordStagingDirectoryName), { recursive: true, force: true });
    fs.rmSync(path.join(root, journal.recordBackupDirectoryName), { recursive: true, force: true });
  }
  removeJournal(bundleDirectory, journal);
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

/** Undo an operation that did not commit its manifest, restoring files and records. */
function rollBackUncommittedOperation(bundleDirectory: string, journal: AnyVersionOperationJournal): void {
  const root = journalArtifactRoot(bundleDirectory, journal);
  const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, journal.versionId);
  const backupDirectory = journal.backupDirectoryName ? path.join(root, journal.backupDirectoryName) : null;
  const restoreVersionId = journal.operationType === 'create-version' ? journal.predecessorVersionId : journal.versionId;
  const installedWasReplaced = journal.operationType === 'create-version' || journal.phase !== 'staging' || !backupDirectory;

  if (installedWasReplaced) fs.rmSync(installedDirectory, { recursive: true, force: true });
  if (backupDirectory && restoreVersionId && fs.existsSync(backupDirectory)) {
    const restoreDirectory = generatedBundleVersionDirectory(bundleDirectory, restoreVersionId);
    fs.rmSync(restoreDirectory, { recursive: true, force: true });
    fs.renameSync(backupDirectory, restoreDirectory);
  }
  if (journal.schemaVersion === 2) {
    restoreGenerationRecordsFromBackup(
      bundleDirectory,
      journal.priorRecords,
      path.join(root, journal.recordBackupDirectoryName),
    );
  }
}

function rollbackSynchronousFailure(
  bundleDirectory: string,
  journal: VersionOperationJournal,
  manifestBefore: ManifestSnapshot,
): void {
  rollBackUncommittedOperation(bundleDirectory, journal);
  restoreManifestSnapshot(bundleDirectory, manifestBefore);
  cleanupOperationArtifacts(bundleDirectory, journal);
}

function buildJournal(
  bundleDirectory: string,
  operationType: VersionOperationType,
  operationId: string,
  versionId: GeneratedBundleVersionId,
  predecessorVersionId: GeneratedBundleVersionId | null,
  hasBackup: boolean,
): VersionOperationJournal {
  const touchedVersionIds = [versionId, ...(predecessorVersionId ? [predecessorVersionId] : [])];
  return {
    schemaVersion: 2,
    operationId,
    operationType,
    phase: 'staging',
    versionId,
    predecessorVersionId,
    stagingDirectoryName: `${STAGING_PREFIX}${operationId}-${versionId}`,
    backupDirectoryName: hasBackup ? `${BACKUP_PREFIX}${operationId}-${predecessorVersionId ?? versionId}` : null,
    recordStagingDirectoryName: `${STAGING_PREFIX}${operationId}-records`,
    recordBackupDirectoryName: `${BACKUP_PREFIX}${operationId}-records`,
    priorRecords: touchedVersionIds.map(id => priorGenerationRecords(bundleDirectory, id)),
  };
}

/**
 * Generate into staging, validate the generated files with records bound to
 * them, and stage both before anything installed is replaced.
 */
async function stageGeneratedResult(
  bundleDirectory: string,
  journal: VersionOperationJournal,
  options: GenerateOptions,
): Promise<{ stagingDirectory: string; generationId: string }> {
  const root = generatedBundleVersionOperationsDirectory(bundleDirectory);
  const stagingDirectory = path.join(root, journal.stagingDirectoryName);
  backupGenerationRecords(bundleDirectory, journal.priorRecords, path.join(root, journal.recordBackupDirectoryName));
  options.onPhase?.('staging');
  const metadata = await options.generate(stagingDirectory);
  await validateStagedGeneration(stagingDirectory, options.validate);
  const pair = buildGenerationRecordPair(metadata.captured, metadata.emitted, await hashGeneratedDirectory(stagingDirectory));
  stageGenerationRecords(pair, journal.versionId, path.join(root, journal.recordStagingDirectoryName));
  return { stagingDirectory, generationId: pair.inputs.generationId };
}

function installStagedResult(bundleDirectory: string, journal: VersionOperationJournal, stagingDirectory: string): void {
  fs.renameSync(stagingDirectory, generatedBundleVersionDirectory(bundleDirectory, journal.versionId));
  installStagedGenerationRecords(
    bundleDirectory,
    journal.versionId,
    path.join(generatedBundleVersionOperationsDirectory(bundleDirectory), journal.recordStagingDirectoryName),
  );
}

function prepareOperation(bundleDirectory: string): ManifestSnapshot {
  const recovery = recoverOperationsInsideLock(bundleDirectory);
  if (recovery.problems.length > 0) throw new VersionCreationNeedsRecoveryError(recovery.problems);
  const snapshot = captureManifestSnapshot(bundleDirectory);
  restoreFrozenGenerationRecords(bundleDirectory, snapshot.manifest);
  return snapshot;
}

export async function generateCurrentBundleVersion(
  bundleDirectory: string,
  options: GenerateOptions,
): Promise<VersionLifecycleResult> {
  return withGeneratedBundleVersionOperation(bundleDirectory, async () => {
    const manifestSnapshot = prepareOperation(bundleDirectory);
    const manifestBefore = manifestSnapshot.manifest;
    assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifestBefore);
    const existingCurrent = currentGeneratedBundleVersion(manifestBefore);
    const versionId = existingCurrent?.versionId ?? generateGeneratedBundleVersionId(
      manifestBefore.versions.map((entry) => entry.versionId),
      { randomBytes: options.randomBytes },
    );
    const operationId = options.operationId?.() ?? randomUUID();
    const journal = buildJournal(bundleDirectory, 'generate-current', operationId, versionId, null, existingCurrent !== null);
    const root = generatedBundleVersionOperationsDirectory(bundleDirectory);
    const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
    const backupDirectory = journal.backupDirectoryName ? path.join(root, journal.backupDirectoryName) : null;
    writeJournal(bundleDirectory, journal);

    try {
      const staged = await stageGeneratedResult(bundleDirectory, journal, options);
      if (existingCurrent && backupDirectory) {
        fs.renameSync(installedDirectory, backupDirectory);
        updateJournalPhase(bundleDirectory, journal, 'predecessor-backed-up', options.onPhase);
      }
      installStagedResult(bundleDirectory, journal, staged.stagingDirectory);
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
      return {
        operationId,
        versionId,
        directory: installedDirectory,
        created: existingCurrent === null,
        manifest: manifestAfter,
        generationId: staged.generationId,
      };
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
  return withGeneratedBundleVersionOperation(bundleDirectory, async () => {
    const manifestSnapshot = prepareOperation(bundleDirectory);
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
    const journal = buildJournal(bundleDirectory, 'create-version', operationId, versionId, current.versionId, true);
    const root = generatedBundleVersionOperationsDirectory(bundleDirectory);
    const backupDirectory = path.join(root, journal.backupDirectoryName!);
    const predecessorDirectory = generatedBundleVersionDirectory(bundleDirectory, current.versionId);
    const installedDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
    writeJournal(bundleDirectory, journal);

    try {
      const staged = await stageGeneratedResult(bundleDirectory, journal, options);
      fs.cpSync(predecessorDirectory, backupDirectory, { recursive: true, force: false });
      updateJournalPhase(bundleDirectory, journal, 'predecessor-backed-up', options.onPhase);
      // Freezing restores the predecessor's saved files and its saved records,
      // including legitimate absence of records for a legacy result.
      restoreGeneratedVersionFromGit(bundleDirectory, current.versionId);
      installStagedResult(bundleDirectory, journal, staged.stagingDirectory);
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
      return {
        operationId,
        versionId,
        directory: installedDirectory,
        created: true,
        manifest: manifestAfter,
        generationId: staged.generationId,
      };
    } catch (error) {
      if ((error as { leaveOperationForRecovery?: boolean }).leaveOperationForRecovery !== true) {
        rollbackSynchronousFailure(bundleDirectory, journal, manifestSnapshot);
      }
      throw error;
    }
  });
}

export async function cancelCurrentGeneratedBundleVersion(bundleDirectory: string): Promise<GeneratedBundleVersionManifest> {
  return withGeneratedBundleVersionOperation(bundleDirectory, () => {
    const manifest = prepareOperation(bundleDirectory).manifest;
    const current = currentGeneratedBundleVersion(manifest);
    if (!current) throw new Error('There is no current version to cancel');
    assertFrozenGeneratedVersionsIntegrity(bundleDirectory, manifest);
    const savedGenerationId = deriveSavedGenerationId(bundleDirectory, current.versionId);
    const manifestAfter = cancelUnsavedCurrentVersion(manifest, savedGenerationId !== null);
    fs.rmSync(generatedBundleVersionDirectory(bundleDirectory, current.versionId), { recursive: true, force: true });
    removeGenerationRecords(bundleDirectory, current.versionId);
    saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
    return manifestAfter;
  });
}

/**
 * Remove a never-saved current version created by another workflow (such as
 * an undone bundle rename) together with its records.
 */
export async function discardUnsavedCurrentGeneratedBundleVersion(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
  manifestAfter: GeneratedBundleVersionManifest,
): Promise<void> {
  await withGeneratedBundleVersionOperation(bundleDirectory, () => {
    fs.rmSync(generatedBundleVersionDirectory(bundleDirectory, versionId), { recursive: true, force: true });
    removeGenerationRecords(bundleDirectory, versionId);
    saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
  });
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
  dependencies: Pick<LifecycleDependencies, 'now' | 'operationId'> & {
    /** Commit the tombstone while the operation still excludes generation. */
    commit?: () => Promise<unknown>;
  } = {},
): Promise<GeneratedBundleVersionManifest> {
  return withGeneratedBundleVersionOperation(bundleDirectory, async () => {
    const manifestSnapshot = prepareOperation(bundleDirectory);
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
      generatedBundleVersionOperationsDirectory(bundleDirectory),
      `${BACKUP_PREFIX}delete-${dependencies.operationId?.() ?? randomUUID()}-${versionId}`,
    );
    fs.mkdirSync(path.dirname(backupDirectory), { recursive: true });
    fs.renameSync(versionDirectory, backupDirectory);
    let manifestAfter: GeneratedBundleVersionManifest;
    try {
      // The saved records stay: they describe the retained saved tree.
      manifestAfter = tombstoneGeneratedBundleVersion(manifestBefore, versionId, {
        localFilesDeletedAt: (dependencies.now?.() ?? new Date()).toISOString(),
        lastSavedGenerationId: savedGenerationId,
      });
      saveGeneratedBundleVersionManifest(bundleDirectory, manifestAfter);
      fs.rmSync(backupDirectory, { recursive: true, force: true });
    } catch (error) {
      restoreManifestSnapshot(bundleDirectory, manifestSnapshot);
      if (fs.existsSync(backupDirectory)) fs.renameSync(backupDirectory, versionDirectory);
      throw error;
    }
    await dependencies.commit?.();
    return manifestAfter;
  });
}

export async function restoreFrozenGeneratedBundleVersion(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): Promise<void> {
  await withGeneratedBundleVersionOperation(bundleDirectory, () => {
    const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
    const entryIndex = manifest.versions.findIndex(entry => entry.versionId === versionId);
    if (entryIndex < 0) throw new Error(`Unknown generated bundle version ${versionId}`);
    if (entryIndex === manifest.versions.length - 1) throw new Error('The current version is not frozen');
    if (manifest.versions[entryIndex].localFilesState === 'deleted') {
      throw new Error('A locally deleted version has no files to restore');
    }
    restoreGeneratedVersionFromGit(bundleDirectory, versionId);
  });
}

function validVersionDirectories(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v[A-Za-z0-9]{6}$/.test(entry.name))
    .map((entry) => entry.name);
}

function journalCompleted(manifest: GeneratedBundleVersionManifest, journal: AnyVersionOperationJournal): boolean {
  const namedInManifest = manifest.versions.some((entry) => entry.versionId === journal.versionId);
  return journal.phase === 'manifest-committed'
    || (namedInManifest && journal.operationType === 'create-version')
    || (namedInManifest && journal.operationType === 'generate-current' && journal.predecessorVersionId === null
      && !journal.backupDirectoryName);
}

function removeStagingDirectories(directory: string, prefix: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(prefix)) {
      const fullPath = path.join(directory, entry.name);
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed.push(fullPath);
    }
  }
  return removed;
}

function recoverOperationsInsideLock(bundleDirectory: string): VersionRecoveryResult {
  const root = generatedBundleVersionsRoot(bundleDirectory);
  const operationsDirectory = generatedBundleVersionOperationsDirectory(bundleDirectory);
  fs.mkdirSync(root, { recursive: true });
  // A lock from an earlier release cannot be held: this process owns the operation.
  fs.rmSync(path.join(root, LEGACY_LOCK_FILENAME), { force: true });
  const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const journal = readJournal(bundleDirectory);
  let recoveredOperation = false;

  if (journal) {
    if (!journalCompleted(manifest, journal)) rollBackUncommittedOperation(bundleDirectory, journal);
    cleanupOperationArtifacts(bundleDirectory, journal);
    recoveredOperation = true;
  }

  const removedStagingDirectories = [
    ...removeStagingDirectories(operationsDirectory, STAGING_PREFIX),
    ...removeStagingDirectories(root, LEGACY_STAGING_PREFIX),
  ];

  const problems: VersionRecoveryProblem[] = [];
  const manifestIds = new Set(manifest.versions.map((entry) => entry.versionId));
  for (const versionDirectoryName of validVersionDirectories(root)) {
    if (manifestIds.has(versionDirectoryName as GeneratedBundleVersionId)) continue;
    const sourcePath = path.join(root, versionDirectoryName);
    fs.mkdirSync(operationsDirectory, { recursive: true });
    const quarantinePath = path.join(operationsDirectory, `${QUARANTINE_PREFIX}${versionDirectoryName}-${randomUUID()}`);
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

/**
 * Recover an interrupted operation outside any running operation, as after a
 * restart. Removes a lock that no running operation can own.
 */
export function recoverGeneratedBundleVersionOperations(bundleDirectory: string): VersionRecoveryResult {
  releaseGeneratedBundleVersionOperationLock(bundleDirectory);
  return recoverOperationsInsideLock(bundleDirectory);
}

export function currentVersionEntry(
  bundleDirectory: string,
): PresentGeneratedBundleVersionEntry | null {
  return currentGeneratedBundleVersion(loadGeneratedBundleVersionManifest(bundleDirectory));
}
