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
import { createHash } from 'crypto';
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

interface RecoveryFileRecord {
  relativePath: string;
  sha256: string;
  mode: number;
  size: number;
}

export interface MigrationRecoveryManifest {
  schemaVersion: 1;
  /** The mandatory pre-migration Git commit SHA. */
  checkpointId: string;
  createdAt: string;
  applicationVersion: string;
  logicalIds: string[];
  declaredIgnoredPaths: string[];
  missingIgnoredPaths: string[];
  files: RecoveryFileRecord[];
}

export interface MigrationJournal {
  schemaVersion: 1;
  /** The mandatory pre-migration Git commit SHA. */
  checkpointId: string;
  applicationVersion: string;
  scope: string;
  migrationId: string;
  /** Portable path from the Home root so recovery travels with the Home. */
  ledgerRelativePath: string;
  phase: 'prepared' | 'running' | 'data-written' | 'ledger-written';
  completedAt: string | null;
}

function validateRecoveryManifest(value: unknown) {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  }
  const fields = new Set([
    'schemaVersion',
    'checkpointId',
    'createdAt',
    'applicationVersion',
    'logicalIds',
    'declaredIgnoredPaths',
    'missingIgnoredPaths',
    'files',
  ]);
  const unknown = Object.keys(value).filter(field => !fields.has(field));
  if (unknown.length > 0) {
    return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
  }
  for (const field of ['checkpointId', 'createdAt', 'applicationVersion']) {
    if (typeof value[field] !== 'string') return { valid: false as const, diagnostic: `$.${field} must be a string` };
  }
  if (!/^[a-f0-9]{40,64}$/.test(String(value.checkpointId))) {
    return { valid: false as const, diagnostic: '$.checkpointId must be a Git commit SHA' };
  }
  if (!Array.isArray(value.logicalIds) || !value.logicalIds.every(item => typeof item === 'string')) {
    return { valid: false as const, diagnostic: '$.logicalIds must be an array of strings' };
  }
  for (const field of ['declaredIgnoredPaths', 'missingIgnoredPaths']) {
    if (!Array.isArray(value[field]) || !(value[field] as unknown[]).every(item => typeof item === 'string')) {
      return { valid: false as const, diagnostic: `$.${field} must be an array of strings` };
    }
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
  return { valid: true as const, value: value as unknown as MigrationRecoveryManifest };
}

function validateJournal(value: unknown) {
  if (!isPlainObject(value) || value.schemaVersion !== 1) {
    return { valid: false as const, diagnostic: '$.schemaVersion must be 1' };
  }
  const fields = new Set([
    'schemaVersion',
    'checkpointId',
    'applicationVersion',
    'scope',
    'migrationId',
    'ledgerRelativePath',
    'phase',
    'completedAt',
  ]);
  const unknown = Object.keys(value).filter(field => !fields.has(field));
  if (unknown.length > 0) {
    return { valid: false as const, diagnostic: `$.${unknown[0]} is not supported` };
  }
  for (const field of ['checkpointId', 'applicationVersion', 'scope', 'migrationId']) {
    if (typeof value[field] !== 'string') return { valid: false as const, diagnostic: `$.${field} must be a string` };
  }
  if (typeof value.ledgerRelativePath !== 'string') {
    return { valid: false as const, diagnostic: '$.ledgerRelativePath must be a string' };
  }
  const ledgerSegments = value.ledgerRelativePath.split('/');
  if (
    path.isAbsolute(value.ledgerRelativePath)
    || ledgerSegments.some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return { valid: false as const, diagnostic: '$.ledgerRelativePath is unsafe' };
  }
  if (!/^[a-f0-9]{40,64}$/.test(String(value.checkpointId))) {
    return { valid: false as const, diagnostic: '$.checkpointId must be a Git commit SHA' };
  }
  if (!['prepared', 'running', 'data-written', 'ledger-written'].includes(String(value.phase))) {
    return { valid: false as const, diagnostic: '$.phase is invalid' };
  }
  if (value.completedAt !== null && typeof value.completedAt !== 'string') {
    return { valid: false as const, diagnostic: '$.completedAt must be a string or null' };
  }
  return { valid: true as const, value: value as unknown as MigrationJournal };
}

const recoveryManifestCodec = jsonDocumentCodec<MigrationRecoveryManifest>(validateRecoveryManifest);
const migrationJournalCodec = jsonDocumentCodec<MigrationJournal>(validateJournal);

export const MIGRATION_RECOVERY_DIRECTORY = '.meadow-migration-recovery';

export function migrationRecoveryRoot(homePath: string): string {
  return path.join(homePath, MIGRATION_RECOVERY_DIRECTORY);
}

function hash(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function portableRelativePath(homePath: string, candidatePath: string): string {
  const resolvedHome = path.resolve(homePath);
  const resolvedCandidate = path.resolve(candidatePath);
  const relativePath = path.relative(resolvedHome, resolvedCandidate);
  if (
    relativePath.length === 0
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error(`Ignored migration recovery path must be a child of the selected Home: ${candidatePath}`);
  }
  const portable = relativePath.split(path.sep).join('/');
  if (portable === '.git' || portable.startsWith('.git/')) {
    throw new Error('Ignored migration recovery paths must not include the Git repository');
  }
  if (portable === MIGRATION_RECOVERY_DIRECTORY || portable.startsWith(`${MIGRATION_RECOVERY_DIRECTORY}/`)) {
    throw new Error('Ignored migration recovery paths must not include the recovery directory itself');
  }
  return portable;
}

function filesUnderDeclaredPath(
  homePath: string,
  declaredPath: string,
): string[] {
  if (!fs.existsSync(declaredPath)) return [];
  const result: string[] = [];
  const walk = (candidatePath: string): void => {
    const stat = fs.lstatSync(candidatePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Ignored migration recovery does not support symbolic links: ${candidatePath}`);
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(candidatePath).sort()) {
        walk(path.join(candidatePath, entry));
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`Ignored migration recovery refuses special file ${candidatePath}`);
    portableRelativePath(homePath, candidatePath);
    result.push(candidatePath);
  };
  walk(declaredPath);
  return result;
}

/**
 * Record a cheap Git recovery point plus byte copies of only the ignored paths
 * that pending migrations explicitly declare. Tracked Home content is never
 * copied or hashed here; Git remains its recovery authority.
 */
export function createMigrationRecovery(
  homePath: string,
  applicationVersion: string,
  logicalIds: string[],
  checkpointId: string,
  ignoredPaths: string[],
): MigrationRecoveryManifest {
  const recoveryRoot = migrationRecoveryRoot(homePath);
  const dataDirectory = path.join(recoveryRoot, 'ignored-files');
  // A directory without a readable manifest can only be residue from a
  // checkpoint attempt that failed before any migration journal was written.
  fs.rmSync(recoveryRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(recoveryRoot, 0o700);
  fs.chmodSync(dataDirectory, 0o700);

  const declaredIgnoredPaths = [
    ...new Set(ignoredPaths.map(candidate => portableRelativePath(homePath, candidate))),
  ].sort();
  const missingIgnoredPaths: string[] = [];
  const files: RecoveryFileRecord[] = [];
  const copiedPaths = new Set<string>();

  for (const relativeDeclaredPath of declaredIgnoredPaths) {
    const declaredPath = path.join(homePath, ...relativeDeclaredPath.split('/'));
    if (!fs.existsSync(declaredPath)) {
      missingIgnoredPaths.push(relativeDeclaredPath);
      continue;
    }
    for (const sourcePath of filesUnderDeclaredPath(homePath, declaredPath)) {
      const relativePath = portableRelativePath(homePath, sourcePath);
      if (copiedPaths.has(relativePath)) continue;
      copiedPaths.add(relativePath);
      const source = fs.readFileSync(sourcePath);
      const destination = path.join(dataDirectory, ...relativePath.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, source, { mode: 0o600 });
      fs.chmodSync(destination, 0o600);
      const copied = fs.readFileSync(destination);
      if (!copied.equals(source)) throw new Error(`Ignored migration recovery copy failed for ${relativePath}`);
      const stats = fs.statSync(sourcePath);
      files.push({ relativePath, sha256: hash(source), mode: stats.mode & 0o777, size: source.length });
    }
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const manifest: MigrationRecoveryManifest = {
    schemaVersion: 1,
    checkpointId,
    createdAt: new Date().toISOString(),
    applicationVersion,
    logicalIds: [...logicalIds],
    declaredIgnoredPaths,
    missingIgnoredPaths,
    files,
  };
  const manifestPath = path.join(recoveryRoot, 'checkpoint.json');
  writeDurableDocument({
    path: manifestPath,
    value: manifest,
    codec: recoveryManifestCodec,
    mode: 0o600,
  });
  const verified = requireValidDocument(readDurableDocument(manifestPath, recoveryManifestCodec), () => {
    throw new Error('Migration recovery manifest disappeared');
  });
  if (verified.files.length !== files.length) throw new Error('Ignored migration recovery file count verification failed');
  for (const record of verified.files) {
    const copied = fs.readFileSync(path.join(dataDirectory, ...record.relativePath.split('/')));
    if (copied.length !== record.size || hash(copied) !== record.sha256) {
      throw new Error(`Ignored migration recovery hash verification failed for ${record.relativePath}`);
    }
  }
  return manifest;
}

export function readMigrationRecovery(homePath: string): MigrationRecoveryManifest | null {
  const result = readDurableDocument(path.join(migrationRecoveryRoot(homePath), 'checkpoint.json'), recoveryManifestCodec);
  if (result.status === 'missing') return null;
  return requireValidDocument(result, () => {
    throw new Error('Migration recovery manifest disappeared');
  });
}

export function migrationJournalPath(homePath: string): string {
  return path.join(migrationRecoveryRoot(homePath), 'migration.json');
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

export function clearMigrationRecovery(homePath: string): void {
  fs.rmSync(migrationRecoveryRoot(homePath), { recursive: true, force: true });
}

export class IncompleteMigrationError extends Error {
  readonly cause: unknown;

  constructor(readonly journal: MigrationJournal, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'IncompleteMigrationError';
    this.cause = options?.cause;
  }
}
