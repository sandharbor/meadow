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

import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import type { MigrationLedger } from '../../../../shared_code/types/migrations.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  yamlDocumentCodec,
} from '../../../../shared_code/utils/durableDocument.js';

interface LegacyMigrationLedger {
  completed_migrations: string[];
}

type MigrationLedgerSource = MigrationLedger | LegacyMigrationLedger;

export interface LoadedMigrationLedger {
  ledger: MigrationLedger;
  needsRewrite: boolean;
}

export class MigrationLedgerConsistencyError extends Error {
  constructor(readonly ledgerPath: string, detail: string) {
    super(`Migration ledger ${ledgerPath} is inconsistent: ${detail}`);
    this.name = 'MigrationLedgerConsistencyError';
  }
}

function validateLedgerSource(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  if ('completed_migrations' in value) {
    const unknown = Object.keys(value).filter(field => field !== 'completed_migrations');
    if (unknown.length > 0) return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
    if (!Array.isArray(value.completed_migrations) || !value.completed_migrations.every(item => typeof item === 'string')) {
      return { valid: false as const, diagnostic: '$.completed_migrations must be an array of strings' };
    }
    if (new Set(value.completed_migrations).size !== value.completed_migrations.length) {
      return { valid: false as const, diagnostic: '$.completed_migrations contains duplicates' };
    }
    return { valid: true as const, value: value as unknown as LegacyMigrationLedger };
  }

  const exactFields = new Set(['schemaVersion', 'scope', 'lastApplicationVersion', 'completedMigrations']);
  const unknown = Object.keys(value).filter(field => !exactFields.has(field));
  if (unknown.length > 0) return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
  if (value.schemaVersion !== 1) return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  if (typeof value.scope !== 'string') return { valid: false as const, diagnostic: '$.scope must be a string' };
  if (typeof value.lastApplicationVersion !== 'string' || value.lastApplicationVersion.length === 0) {
    return { valid: false as const, diagnostic: '$.lastApplicationVersion must be a string' };
  }
  if (!Array.isArray(value.completedMigrations)) {
    return { valid: false as const, diagnostic: '$.completedMigrations must be an array' };
  }
  const completedMigrations = value.completedMigrations as unknown[];
  const ids = new Set<string>();
  for (let index = 0; index < completedMigrations.length; index += 1) {
    const record = completedMigrations[index];
    const prefix = `$.completedMigrations[${index}]`;
    if (!isPlainObject(record)) return { valid: false as const, diagnostic: `${prefix} must be an object` };
    const recordFields = new Set(['id', 'completedAt', 'applicationVersion']);
    const recordUnknown = Object.keys(record).filter(field => !recordFields.has(field));
    if (recordUnknown.length > 0) {
      return { valid: false as const, diagnostic: `${prefix}.${recordUnknown[0]} is not supported` };
    }
    for (const field of ['id', 'completedAt', 'applicationVersion']) {
      if (typeof record[field] !== 'string' || record[field].length === 0) {
        return { valid: false as const, diagnostic: `${prefix}.${field} must be a string` };
      }
    }
    if (Number.isNaN(Date.parse(String(record.completedAt)))) {
      return { valid: false as const, diagnostic: `${prefix}.completedAt must be an ISO timestamp` };
    }
    if (ids.has(String(record.id))) {
      return { valid: false as const, diagnostic: '$.completedMigrations contains duplicate IDs' };
    }
    ids.add(String(record.id));
  }
  return { valid: true as const, value: value as unknown as MigrationLedger };
}

export const migrationLedgerCodec = yamlDocumentCodec<MigrationLedgerSource>(validateLedgerSource);

function logicalIdFromLegacyEntry(entry: string): string {
  return entry.replace(/\.(?:ts|js)$/, '');
}

function distinctLegacyLogicalIds(entries: string[], ledgerPath: string): string[] {
  const extensionsById = new Map<string, Set<string>>();
  const result: string[] = [];
  for (const entry of entries) {
    const extension = path.extname(entry);
    if (extension !== '.ts' && extension !== '.js') {
      throw new MigrationLedgerConsistencyError(ledgerPath, 'a legacy entry is not a TypeScript or JavaScript filename');
    }
    const id = logicalIdFromLegacyEntry(entry);
    const extensions = extensionsById.get(id);
    if (!extensions) {
      extensionsById.set(id, new Set([extension]));
      result.push(id);
      continue;
    }
    if (extensions.has(extension)) {
      throw new MigrationLedgerConsistencyError(ledgerPath, `logical ID ${id} is duplicated`);
    }
    // Private builds sometimes recorded both the source .ts and packaged .js
    // filename. They are one completed logical migration, not a rerun signal.
    extensions.add(extension);
  }
  return result;
}

export function loadMigrationLedger(
  ledgerPath: string,
  scope: string,
  availableIds: ReadonlySet<string>,
  applicationVersion: string,
): LoadedMigrationLedger {
  const source = requireValidDocument(
    readDurableDocument(ledgerPath, migrationLedgerCodec),
    (): MigrationLedgerSource => ({
      schemaVersion: 1,
      scope,
      lastApplicationVersion: applicationVersion,
      completedMigrations: [],
    }),
  );

  if ('completed_migrations' in source) {
    const ids = distinctLegacyLogicalIds(source.completed_migrations, ledgerPath);
    for (const id of ids) {
      if (!availableIds.has(id)) {
        throw new MigrationLedgerConsistencyError(ledgerPath, `unknown logical ID ${id}`);
      }
    }
    return {
      needsRewrite: true,
      ledger: {
        schemaVersion: 1,
        scope,
        lastApplicationVersion: applicationVersion,
        completedMigrations: ids.map(id => ({
          id,
          completedAt: new Date(0).toISOString(),
          applicationVersion: 'legacy-filename-ledger',
        })),
      },
    };
  }

  if (source.scope !== scope) {
    throw new MigrationLedgerConsistencyError(ledgerPath, `ledger belongs to scope ${source.scope}, not ${scope}`);
  }
  for (const record of source.completedMigrations) {
    if (!availableIds.has(record.id)) {
      throw new MigrationLedgerConsistencyError(ledgerPath, `unknown logical ID ${record.id}`);
    }
  }
  return { ledger: source, needsRewrite: false };
}

export function saveMigrationLedger(ledgerPath: string, ledger: MigrationLedger): void {
  writeDurableDocument({ path: ledgerPath, value: ledger, codec: migrationLedgerCodec });
}

interface CheckpointFileRecord {
  relativePath: string;
  sha256: string;
  mode: number;
  size: number;
}

export interface MigrationCheckpointManifest {
  schemaVersion: 1;
  checkpointId: string;
  createdAt: string;
  applicationVersion: string;
  homePath: string;
  logicalIds: string[];
  files: CheckpointFileRecord[];
}

export interface MigrationJournal {
  schemaVersion: 1;
  checkpointId: string;
  applicationVersion: string;
  scope: string;
  migrationId: string;
  ledgerPath: string;
  phase: 'prepared' | 'running' | 'data-written' | 'ledger-written';
  sourceDataDigest: string;
  postDataDigest: string | null;
  completedAt: string | null;
}

function validateCheckpointManifest(value: unknown) {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  }
  const fields = new Set([
    'schemaVersion',
    'checkpointId',
    'createdAt',
    'applicationVersion',
    'homePath',
    'logicalIds',
    'files',
  ]);
  const unknown = Object.keys(value).filter(field => !fields.has(field));
  if (unknown.length > 0) {
    return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
  }
  for (const field of ['checkpointId', 'createdAt', 'applicationVersion', 'homePath']) {
    if (typeof value[field] !== 'string') return { valid: false as const, diagnostic: `$.${field} must be a string` };
  }
  if (!Array.isArray(value.logicalIds) || !value.logicalIds.every(item => typeof item === 'string')) {
    return { valid: false as const, diagnostic: '$.logicalIds must be an array of strings' };
  }
  if (!Array.isArray(value.files)) return { valid: false as const, diagnostic: '$.files must be an array' };
  const files = value.files as unknown[];
  const relativePaths = new Set<string>();
  for (let index = 0; index < files.length; index += 1) {
    const record = files[index];
    if (!isPlainObject(record)) return { valid: false as const, diagnostic: `$.files[${index}] must be an object` };
    if (typeof record.relativePath !== 'string' || !/^[a-f0-9]{64}$/.test(String(record.sha256))) {
      return { valid: false as const, diagnostic: `$.files[${index}] paths and hashes must be strings` };
    }
    const portablePath = record.relativePath.split('/');
    if (
      path.isAbsolute(record.relativePath)
      || portablePath.some(segment => segment.length === 0 || segment === '.' || segment === '..')
      || relativePaths.has(record.relativePath)
    ) {
      return { valid: false as const, diagnostic: `$.files[${index}].relativePath is unsafe or duplicated` };
    }
    relativePaths.add(record.relativePath);
    if (
      !Number.isInteger(record.mode)
      || Number(record.mode) < 0
      || Number(record.mode) > 0o777
      || !Number.isSafeInteger(record.size)
      || Number(record.size) < 0
    ) {
      return { valid: false as const, diagnostic: `$.files[${index}] mode and size must be integers` };
    }
  }
  return { valid: true as const, value: value as unknown as MigrationCheckpointManifest };
}

function validateJournal(value: unknown) {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  }
  for (const field of [
    'checkpointId',
    'applicationVersion',
    'scope',
    'migrationId',
    'ledgerPath',
    'sourceDataDigest',
  ]) {
    if (typeof value[field] !== 'string') return { valid: false as const, diagnostic: `$.${field} must be a string` };
  }
  if (!['prepared', 'running', 'data-written', 'ledger-written'].includes(String(value.phase))) {
    return { valid: false as const, diagnostic: '$.phase is invalid' };
  }
  if (value.postDataDigest !== null && typeof value.postDataDigest !== 'string') {
    return { valid: false as const, diagnostic: '$.postDataDigest must be a string or null' };
  }
  if (value.completedAt !== null && typeof value.completedAt !== 'string') {
    return { valid: false as const, diagnostic: '$.completedAt must be a string or null' };
  }
  return { valid: true as const, value: value as unknown as MigrationJournal };
}

const checkpointManifestCodec = jsonDocumentCodec<MigrationCheckpointManifest>(validateCheckpointManifest);
const migrationJournalCodec = jsonDocumentCodec<MigrationJournal>(validateJournal);

export function migrationRecoveryRoot(homePath: string): string {
  return path.join(path.dirname(homePath), `.${path.basename(homePath)}.meadow-recovery`);
}

function hash(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function homeFiles(
  homePath: string,
  includeLedgers: boolean,
  excludedPaths: ReadonlySet<string> = new Set(),
): string[] {
  if (!fs.existsSync(homePath)) return [];
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'logs') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isSymbolicLink()) throw new Error(`Migration safety does not support symlinked Home path ${fullPath}`);
      else if (
        entry.isFile() &&
        !excludedPaths.has(path.resolve(fullPath)) &&
        (includeLedgers || entry.name !== 'migrations.yaml')
      ) files.push(fullPath);
    }
  };
  walk(homePath);
  return files.sort();
}

export function meadowHomeDataDigest(
  homePath: string,
  excludedPaths: ReadonlySet<string> = new Set(),
): string {
  const digest = createHash('sha256');
  for (const filePath of homeFiles(homePath, false, excludedPaths)) {
    const relative = path.relative(homePath, filePath).split(path.sep).join('/');
    digest.update(relative);
    digest.update('\0');
    digest.update(fs.readFileSync(filePath));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export function createMigrationCheckpoint(
  homePath: string,
  applicationVersion: string,
  logicalIds: string[],
): MigrationCheckpointManifest {
  const checkpointId = `migration-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const checkpointDirectory = path.join(migrationRecoveryRoot(homePath), 'checkpoints', checkpointId);
  const dataDirectory = path.join(checkpointDirectory, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(checkpointDirectory, 0o700);
  fs.chmodSync(dataDirectory, 0o700);

  const files: CheckpointFileRecord[] = [];
  for (const sourcePath of homeFiles(homePath, true)) {
    const relativePath = path.relative(homePath, sourcePath).split(path.sep).join('/');
    const source = fs.readFileSync(sourcePath);
    const destination = path.join(dataDirectory, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, source, { mode: 0o600 });
    fs.chmodSync(destination, 0o600);
    const copied = fs.readFileSync(destination);
    if (!copied.equals(source)) throw new Error(`Migration checkpoint verification failed for ${relativePath}`);
    const stats = fs.statSync(sourcePath);
    files.push({ relativePath, sha256: hash(source), mode: stats.mode & 0o777, size: source.length });
  }

  const manifest: MigrationCheckpointManifest = {
    schemaVersion: 1,
    checkpointId,
    createdAt: new Date().toISOString(),
    applicationVersion,
    homePath,
    logicalIds: [...logicalIds],
    files,
  };
  const manifestPath = path.join(checkpointDirectory, 'checkpoint.json');
  writeDurableDocument({
    path: manifestPath,
    value: manifest,
    codec: checkpointManifestCodec,
    mode: 0o600,
  });
  const verified = requireValidDocument(readDurableDocument(manifestPath, checkpointManifestCodec), () => {
    throw new Error('Migration checkpoint manifest disappeared');
  });
  if (verified.files.length !== files.length) throw new Error('Migration checkpoint file count verification failed');
  for (const record of verified.files) {
    const copied = fs.readFileSync(path.join(dataDirectory, ...record.relativePath.split('/')));
    if (copied.length !== record.size || hash(copied) !== record.sha256) {
      throw new Error(`Migration checkpoint hash verification failed for ${record.relativePath}`);
    }
  }
  return manifest;
}

export interface MigrationCheckpointRestoreResult {
  checkpointId: string;
  preRestoreCheckpointId: string;
  preservedPreviousHomePath: string;
}

function copyPreservedTree(source: string, destination: string): void {
  if (!fs.existsSync(source)) return;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Recovery refuses symbolic link ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const entry of fs.readdirSync(source)) {
      copyPreservedTree(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Recovery refuses special file ${source}`);
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, stat.mode & 0o777);
}

function fsyncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Restores a verified migration checkpoint after an explicit user action.
 * The current Home is independently checkpointed first and then retained in
 * full until the restored Home has been atomically installed.
 */
export function restoreMigrationCheckpoint(
  homePath: string,
  checkpointId: string,
  applicationVersion: string,
): MigrationCheckpointRestoreResult {
  if (!/^[A-Za-z0-9._-]+$/.test(checkpointId)) {
    throw new Error('Recovery checkpoint ID contains unsafe characters');
  }
  const resolvedHome = path.resolve(homePath);
  const homeStat = fs.lstatSync(resolvedHome);
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink()) {
    throw new Error('Recovery Home must be a real directory');
  }

  const recoveryRoot = migrationRecoveryRoot(resolvedHome);
  const checkpointDirectory = path.join(recoveryRoot, 'checkpoints', checkpointId);
  const dataDirectory = path.join(checkpointDirectory, 'data');
  const manifest = requireValidDocument(
    readDurableDocument(path.join(checkpointDirectory, 'checkpoint.json'), checkpointManifestCodec),
    () => { throw new Error(`Recovery checkpoint ${checkpointId} does not exist`); },
  );
  if (manifest.checkpointId !== checkpointId || path.resolve(manifest.homePath) !== resolvedHome) {
    throw new Error('Recovery checkpoint does not belong to the selected Meadow Home');
  }
  const checkpointFiles = new Set(manifest.files.map(record => record.relativePath));
  const actualFiles = homeFiles(dataDirectory, true)
    .map(filePath => path.relative(dataDirectory, filePath).split(path.sep).join('/'));
  if (actualFiles.length !== checkpointFiles.size
    || actualFiles.some(relativePath => !checkpointFiles.has(relativePath))) {
    throw new Error('Recovery checkpoint data does not match its manifest');
  }
  for (const record of manifest.files) {
    const source = path.join(dataDirectory, ...record.relativePath.split('/'));
    const contents = fs.readFileSync(source);
    if (contents.length !== record.size || hash(contents) !== record.sha256) {
      throw new Error(`Recovery checkpoint hash mismatch for ${record.relativePath}`);
    }
  }
  const journalBeforeRestore = readMigrationJournal(resolvedHome);
  if (journalBeforeRestore && journalBeforeRestore.checkpointId !== checkpointId) {
    throw new Error('Recovery checkpoint does not match the current migration journal');
  }

  const restoreId = `restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const stagingPath = path.join(path.dirname(resolvedHome), `.${path.basename(resolvedHome)}.${restoreId}.stage`);
  const restoreRecordDirectory = path.join(recoveryRoot, 'restores', restoreId);
  const previousHomePath = path.join(restoreRecordDirectory, 'previous-home');
  if (fs.existsSync(stagingPath) || fs.existsSync(previousHomePath)) {
    throw new Error('Recovery staging path already exists');
  }
  fs.mkdirSync(stagingPath, { mode: 0o700 });
  try {
    copyPreservedTree(path.join(resolvedHome, '.git'), path.join(stagingPath, '.git'));
    copyPreservedTree(path.join(resolvedHome, 'logs'), path.join(stagingPath, 'logs'));
    for (const record of manifest.files) {
      const source = path.join(dataDirectory, ...record.relativePath.split('/'));
      const destination = path.join(stagingPath, ...record.relativePath.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, record.mode);
      const copied = fs.readFileSync(destination);
      if (copied.length !== record.size || hash(copied) !== record.sha256) {
        throw new Error(`Recovery staging verification failed for ${record.relativePath}`);
      }
    }

    const safetyCheckpoint = createMigrationCheckpoint(
      resolvedHome,
      applicationVersion,
      [`manual-restore-before-${checkpointId}`],
    );
    fs.mkdirSync(restoreRecordDirectory, { recursive: true, mode: 0o700 });
    fs.renameSync(resolvedHome, previousHomePath);
    try {
      fs.renameSync(stagingPath, resolvedHome);
      fsyncDirectory(path.dirname(resolvedHome));
    } catch (error) {
      fs.renameSync(previousHomePath, resolvedHome);
      throw error;
    }

    const journalPath = migrationJournalPath(resolvedHome);
    if (fs.existsSync(journalPath)) {
      fs.renameSync(journalPath, path.join(restoreRecordDirectory, 'interrupted-migration-journal.json'));
    }
    return {
      checkpointId,
      preRestoreCheckpointId: safetyCheckpoint.checkpointId,
      preservedPreviousHomePath: previousHomePath,
    };
  } catch (error) {
    if (fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

export function migrationJournalPath(homePath: string): string {
  return path.join(migrationRecoveryRoot(homePath), 'journals', 'migration.json');
}

export function readMigrationJournal(homePath: string): MigrationJournal | null {
  const result = readDurableDocument(migrationJournalPath(homePath), migrationJournalCodec);
  if (result.status === 'missing') return null;
  return requireValidDocument(result, () => {
    throw new Error('Migration journal disappeared');
  });
}

export function writeMigrationJournal(homePath: string, journal: MigrationJournal): void {
  writeDurableDocument({
    path: migrationJournalPath(homePath),
    value: journal,
    codec: migrationJournalCodec,
    mode: 0o600,
  });
}

export function removeMigrationJournal(homePath: string): void {
  const journalPath = migrationJournalPath(homePath);
  try {
    fs.unlinkSync(journalPath);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

export class IncompleteMigrationError extends Error {
  constructor(readonly journal: MigrationJournal, message: string) {
    super(message);
    this.name = 'IncompleteMigrationError';
  }
}
