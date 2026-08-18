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
import { fileURLToPath, pathToFileURL } from 'url';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import { commitChangesNative } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import { getAllBackendProviders } from '../publishing-provider-host/providerRegistry.js';
import type { Migration, MigrationLedger } from '../../../../shared_code/types/migrations.js';
import {
  IncompleteMigrationError,
  createMigrationCheckpoint,
  loadMigrationLedger,
  meadowHomeDataDigest,
  migrationRecoveryRoot,
  readMigrationJournal,
  removeMigrationJournal,
  saveMigrationLedger,
  writeMigrationJournal,
  type LoadedMigrationLedger,
  type MigrationCheckpointManifest,
  type MigrationJournal,
} from './migrationPersistence.js';
import { retiredMigrationIdsForScope } from './migrationHistory.js';

export interface MigrationScope {
  name: string;
  migrationsDir: string;
  ledgerPath: string;
}

interface MigrationDescriptor {
  scope: MigrationScope;
  filename: string;
  id: string;
  migration: Migration;
}

interface PreparedScope {
  scope: MigrationScope;
  descriptors: MigrationDescriptor[];
  loadedLedger: LoadedMigrationLedger;
}

export interface MigrationFaults {
  afterCheckpoint?: (checkpoint: MigrationCheckpointManifest) => void;
  afterPreparedJournal?: (migrationId: string) => void;
  afterRunningJournal?: (migrationId: string) => void;
  afterMigration?: (migrationId: string) => void;
  afterDataJournal?: (migrationId: string) => void;
  afterLedger?: (migrationId: string) => void;
  afterLedgerJournal?: (migrationId: string) => void;
}

export interface RunMigrationsOptions {
  skipGitCommits?: boolean;
  configDir?: string;
  applicationVersion?: string;
  faults?: MigrationFaults;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_FILENAME_PATTERN = /^\d{2}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}_[A-Za-z0-9_]+\.(?:ts|js)$/;

function logicalIdFromFilename(filename: string): string {
  if (!MIGRATION_FILENAME_PATTERN.test(filename)) {
    throw new Error(`Migration filename does not have a validated sortable prefix: ${filename}`);
  }
  return filename.replace(/\.(?:ts|js)$/, '');
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'))
    .sort();
}

async function loadDescriptor(scope: MigrationScope, filename: string): Promise<MigrationDescriptor> {
  const id = logicalIdFromFilename(filename);
  const fullPath = path.join(scope.migrationsDir, filename);
  const mod = (await import(`${pathToFileURL(fullPath).href}?meadowMigration=${encodeURIComponent(id)}`)) as {
    migration?: Migration;
  };
  if (!mod.migration || typeof mod.migration.run !== 'function') {
    throw new Error(`Migration ${scope.name}/${filename} is missing export 'migration.run'`);
  }
  if (mod.migration.id !== id) {
    throw new Error(
      `Migration ${scope.name}/${filename} exports logical ID '${mod.migration.id}', expected '${id}'`,
    );
  }
  return { scope, filename, id, migration: mod.migration };
}

async function prepareScope(scope: MigrationScope, applicationVersion: string): Promise<PreparedScope> {
  const descriptors = await Promise.all(
    listMigrationFiles(scope.migrationsDir).map(file => loadDescriptor(scope, file)),
  );
  const ids = descriptors.map(descriptor => descriptor.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Migration scope ${scope.name} contains duplicate logical IDs`);
  }
  const acceptedIds = new Set([...ids, ...retiredMigrationIdsForScope(scope.name)]);
  const loadedLedger = loadMigrationLedger(scope.ledgerPath, scope.name, acceptedIds, applicationVersion);
  return { scope, descriptors, loadedLedger };
}

function discoverScopes(configDir: string): MigrationScope[] {
  const scopes: MigrationScope[] = [{
    name: 'core',
    migrationsDir: path.join(__dirname, 'versions'),
    ledgerPath: path.join(configDir, 'migrations.yaml'),
  }];
  for (const provider of getAllBackendProviders()) {
    const providerId = provider.manifest.id;
    const providerMigrationsDir = path.resolve(
      __dirname,
      '../../../../publishing_providers',
      providerId,
      'backend/migrations',
    );
    if (!fs.existsSync(providerMigrationsDir)) continue;
    scopes.push({
      name: providerId,
      migrationsDir: providerMigrationsDir,
      ledgerPath: path.join(
        PublishingProviderPaths.getGlobalProviderDir(configDir, providerId),
        'migrations.yaml',
      ),
    });
  }
  return scopes;
}

function ledgerHas(ledger: MigrationLedger, id: string): boolean {
  return ledger.completedMigrations.some(record => record.id === id);
}

function recordCompletion(
  ledger: MigrationLedger,
  id: string,
  applicationVersion: string,
  completedAt: string,
): void {
  if (ledgerHas(ledger, id)) return;
  ledger.completedMigrations.push({ id, applicationVersion, completedAt });
  ledger.lastApplicationVersion = applicationVersion;
}

function findPreparedScope(scopes: PreparedScope[], name: string): PreparedScope {
  const prepared = scopes.find(item => item.scope.name === name);
  if (!prepared) throw new Error(`Incomplete migration journal references unavailable scope ${name}`);
  return prepared;
}

function recoverIncompleteMigration(
  configDir: string,
  scopes: PreparedScope[],
  applicationVersion: string,
): void {
  const journal = readMigrationJournal(configDir);
  if (!journal) return;
  if (journal.applicationVersion !== applicationVersion) {
    throw new IncompleteMigrationError(
      journal,
      `Migration ${journal.migrationId} was interrupted under Meadow ${journal.applicationVersion}; checkpoint ${journal.checkpointId} requires recovery before Meadow ${applicationVersion} can continue`,
    );
  }
  const checkpointDirectory = path.join(
    migrationRecoveryRoot(configDir),
    'checkpoints',
    journal.checkpointId,
  );
  if (!fs.existsSync(path.join(checkpointDirectory, 'checkpoint.json'))) {
    throw new IncompleteMigrationError(journal, `Verified checkpoint ${journal.checkpointId} is unavailable`);
  }

  const prepared = findPreparedScope(scopes, journal.scope);
  if (!prepared.descriptors.some(descriptor => descriptor.id === journal.migrationId)) {
    throw new IncompleteMigrationError(journal, `Interrupted migration ${journal.migrationId} is unavailable`);
  }
  const ledgerPaths = new Set(scopes.map(item => path.resolve(item.scope.ledgerPath)));
  const currentDigest = meadowHomeDataDigest(configDir, ledgerPaths);
  const completed = ledgerHas(prepared.loadedLedger.ledger, journal.migrationId);

  if (
    (journal.phase === 'prepared' || journal.phase === 'running') &&
    currentDigest === journal.sourceDataDigest &&
    !completed
  ) {
    removeMigrationJournal(configDir);
    return;
  }

  if (
    (journal.phase === 'data-written' || journal.phase === 'ledger-written') &&
    journal.postDataDigest !== null &&
    currentDigest === journal.postDataDigest
  ) {
    if (!completed) {
      recordCompletion(
        prepared.loadedLedger.ledger,
        journal.migrationId,
        journal.applicationVersion,
        journal.completedAt ?? new Date().toISOString(),
      );
      saveMigrationLedger(prepared.scope.ledgerPath, prepared.loadedLedger.ledger);
    }
    removeMigrationJournal(configDir);
    return;
  }

  throw new IncompleteMigrationError(
    journal,
    `Migration ${journal.migrationId} is incomplete and current Home hashes do not prove a safe automatic action. Preserve Home and use checkpoint ${journal.checkpointId}.`,
  );
}

async function optionalGitCheckpoint(
  phase: 'pre' | 'post',
  configDir: string,
  skipGitCommits: boolean,
): Promise<void> {
  if (skipGitCommits) return;
  try {
    await commitChangesNative(
      [configDir],
      `migration: ${phase}-migration - ${phase === 'pre' ? 'commit everything' : 'all changes'}`,
      { configDir, allowEmpty: true },
    );
  } catch (error) {
    logger.warn(
      `[migrations] Optional ${phase}-migration Git commit failed; verified external checkpoint remains authoritative:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export async function runMigrationsForScopes(
  scopes: MigrationScope[],
  options: RunMigrationsOptions = {},
): Promise<void> {
  const applicationVersion =
    options.applicationVersion ?? process.env.MEADOW_APP_VERSION ?? '0.5.41-migration-test';
  const configDir = options.configDir ?? path.dirname(scopes[0]?.ledgerPath ?? process.cwd());
  const preparedScopes = await Promise.all(scopes.map(scope => prepareScope(scope, applicationVersion)));

  recoverIncompleteMigration(configDir, preparedScopes, applicationVersion);

  const currentScopes = await Promise.all(scopes.map(scope => prepareScope(scope, applicationVersion)));
  const ledgerPaths = new Set(currentScopes.map(item => path.resolve(item.scope.ledgerPath)));
  const pending = currentScopes.flatMap(prepared =>
    prepared.descriptors.filter(descriptor => !ledgerHas(prepared.loadedLedger.ledger, descriptor.id)),
  );
  const ledgersNeedRewrite = currentScopes.some(prepared => prepared.loadedLedger.needsRewrite);
  if (pending.length === 0 && !ledgersNeedRewrite) return;

  const checkpoint = createMigrationCheckpoint(
    configDir,
    applicationVersion,
    pending.map(item => `${item.scope.name}/${item.id}`),
  );
  options.faults?.afterCheckpoint?.(checkpoint);
  logger.info(`[migrations] Verified checkpoint ${checkpoint.checkpointId}`);

  for (const prepared of currentScopes) {
    if (prepared.loadedLedger.needsRewrite) {
      saveMigrationLedger(prepared.scope.ledgerPath, prepared.loadedLedger.ledger);
      prepared.loadedLedger.needsRewrite = false;
    }
  }

  await optionalGitCheckpoint('pre', configDir, options.skipGitCommits === true);

  for (const descriptor of pending) {
    const prepared = findPreparedScope(currentScopes, descriptor.scope.name);
    const sourceDataDigest = meadowHomeDataDigest(configDir, ledgerPaths);
    let journal: MigrationJournal = {
      schemaVersion: 1,
      checkpointId: checkpoint.checkpointId,
      applicationVersion,
      scope: descriptor.scope.name,
      migrationId: descriptor.id,
      ledgerPath: descriptor.scope.ledgerPath,
      phase: 'prepared',
      sourceDataDigest,
      postDataDigest: null,
      completedAt: null,
    };
    writeMigrationJournal(configDir, journal);
    options.faults?.afterPreparedJournal?.(descriptor.id);

    journal = { ...journal, phase: 'running' };
    writeMigrationJournal(configDir, journal);
    options.faults?.afterRunningJournal?.(descriptor.id);
    logger.info(`[migrations] -> ${descriptor.scope.name}/${descriptor.id}`);
    await descriptor.migration.run();
    options.faults?.afterMigration?.(descriptor.id);

    const completedAt = new Date().toISOString();
    journal = {
      ...journal,
      phase: 'data-written',
      postDataDigest: meadowHomeDataDigest(configDir, ledgerPaths),
      completedAt,
    };
    writeMigrationJournal(configDir, journal);
    options.faults?.afterDataJournal?.(descriptor.id);

    recordCompletion(prepared.loadedLedger.ledger, descriptor.id, applicationVersion, completedAt);
    saveMigrationLedger(descriptor.scope.ledgerPath, prepared.loadedLedger.ledger);
    options.faults?.afterLedger?.(descriptor.id);

    journal = { ...journal, phase: 'ledger-written' };
    writeMigrationJournal(configDir, journal);
    options.faults?.afterLedgerJournal?.(descriptor.id);
    removeMigrationJournal(configDir);
  }

  await optionalGitCheckpoint('post', configDir, options.skipGitCommits === true);
  logger.info('[migrations] ✓ Startup migrations complete');
}

export async function runMigrationsOnStartup(): Promise<void> {
  const configDir = getConfigDirectory();
  const applicationVersion = process.env.MEADOW_APP_VERSION;
  if (!applicationVersion) throw new Error('MEADOW_APP_VERSION is required for migration safety');
  await runMigrationsForScopes(discoverScopes(configDir), { configDir, applicationVersion });
}
