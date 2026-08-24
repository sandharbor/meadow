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
import { PublishingProviderPaths } from '../../../../../shared_code/paths/publishingProviderPaths.js';
import { getAllBackendProviders } from '../publishing-provider-host/providerRegistry.js';
import type { Migration, MigrationLedger } from '../../../../../shared_code/types/migrations.js';
import {
  IncompleteMigrationError,
  clearMigrationRecovery,
  createMigrationRecovery,
  loadMigrationLedger,
  readMigrationJournal,
  readMigrationRecovery,
  saveMigrationLedger,
  writeMigrationJournal,
  type LoadedMigrationLedger,
  type MigrationRecoveryManifest,
  type MigrationJournal,
} from './migrationPersistence.js';
import { retiredMigrationIdsForScope } from './migrationHistory.js';
import {
  assertMigrationGitGuard,
  captureMigrationGitGuard,
  type MigrationGitGuard,
} from './migrationGitGuard.js';

export interface MigrationScope {
  name: string;
  migrationsDir: string;
  ledgerPath: string;
  /** IDs whose migration source has been retired but may remain in existing ledgers. */
  retiredMigrationIds?: readonly string[];
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
  afterCheckpoint?: (checkpoint: MigrationRecoveryManifest) => void;
  afterPreparedJournal?: (migrationId: string) => void;
  afterRunningJournal?: (migrationId: string) => void;
  afterMigration?: (migrationId: string) => void;
  afterDataJournal?: (migrationId: string) => void;
  afterLedger?: (migrationId: string) => void;
  afterLedgerJournal?: (migrationId: string) => void;
}

export interface RunMigrationsOptions {
  /** Unit-test escape hatch. Production migration startup must never set this. */
  skipGitCommits?: boolean;
  configDir?: string;
  applicationVersion?: string;
  faults?: MigrationFaults;
  /** Test hook for exercising required Git checkpoint sequencing without the native binary. */
  gitCheckpoint?: (phase: 'pre' | 'post', configDir: string) => Promise<string>;
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
  const acceptedIds = new Set([
    ...ids,
    ...retiredMigrationIdsForScope(scope.name),
    ...(scope.retiredMigrationIds ?? []),
  ]);
  const loadedLedger = loadMigrationLedger(scope.ledgerPath, scope.name, acceptedIds, applicationVersion);
  return { scope, descriptors, loadedLedger };
}

function discoverScopes(configDir: string): MigrationScope[] {
  const e2eCoreMigrationsDir = process.env.MEADOW_E2E_CORE_MIGRATIONS_DIRECTORY;
  if (
    e2eCoreMigrationsDir
    && (process.env.MEADOW_E2E_TEST !== 'true' || process.env.MEADOW_IS_DEV !== 'true')
  ) {
    throw new Error(
      'MEADOW_E2E_CORE_MIGRATIONS_DIRECTORY is restricted to development E2E processes',
    );
  }
  const scopes: MigrationScope[] = [{
    name: 'core',
    migrationsDir: e2eCoreMigrationsDir
      ? path.resolve(e2eCoreMigrationsDir)
      : path.join(__dirname, 'versions'),
    ledgerPath: path.join(configDir, 'migrations.yaml'),
  }];
  for (const provider of getAllBackendProviders()) {
    const providerId = provider.manifest.id;
    const providerMigrationsDir = path.resolve(
      __dirname,
      '../../../../../publishing_providers',
      providerId,
      'backend/migrations',
    );
    const retiredMigrationIds = provider.retiredMigrationIds ?? [];
    if (!fs.existsSync(providerMigrationsDir) && retiredMigrationIds.length === 0) continue;
    scopes.push({
      name: providerId,
      migrationsDir: providerMigrationsDir,
      ledgerPath: path.join(
        PublishingProviderPaths.getGlobalProviderDir(configDir, providerId),
        'migrations.yaml',
      ),
      retiredMigrationIds,
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

function portableHomePath(homePath: string, candidatePath: string): string {
  const relativePath = path.relative(path.resolve(homePath), path.resolve(candidatePath));
  if (
    relativePath.length === 0
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error(`Migration path must be a child of the selected Home: ${candidatePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

async function requiredGitCheckpoint(
  phase: 'pre' | 'post',
  configDir: string,
  options: RunMigrationsOptions,
): Promise<string> {
  if (options.gitCheckpoint) {
    const checkpointId = await options.gitCheckpoint(phase, configDir);
    if (!/^[a-f0-9]{40,64}$/.test(checkpointId)) {
      throw new Error(`Migration Git checkpoint returned an invalid commit SHA during ${phase}`);
    }
    return checkpointId;
  }
  if (options.skipGitCommits === true) {
    return phase === 'pre'
      ? '0000000000000000000000000000000000000000'
      : '1111111111111111111111111111111111111111';
  }
  const checkpointId = await commitChangesNative(
    [configDir],
    `migration: ${phase}-migration - ${phase === 'pre' ? 'commit everything' : 'all changes'}`,
    {
      configDir,
      manageGitAutomatically: true,
      allowEmpty: true,
    },
  );
  if (!checkpointId || !/^[a-f0-9]{40,64}$/.test(checkpointId)) {
    throw new Error(`Required ${phase}-migration Git checkpoint did not produce a commit SHA`);
  }
  return checkpointId;
}

async function finishRecoveredBatch(
  configDir: string,
  options: RunMigrationsOptions,
): Promise<void> {
  await requiredGitCheckpoint('post', configDir, options);
  clearMigrationRecovery(configDir);
}

async function recoverIncompleteMigration(
  configDir: string,
  scopes: PreparedScope[],
  applicationVersion: string,
  options: RunMigrationsOptions,
): Promise<void> {
  const recovery = readMigrationRecovery(configDir);
  const journal = readMigrationJournal(configDir);
  if (!journal) {
    if (recovery) await finishRecoveredBatch(configDir, options);
    return;
  }
  if (!recovery || recovery.checkpointId !== journal.checkpointId) {
    throw new IncompleteMigrationError(
      journal,
      `Migration ${journal.migrationId} has no matching Git recovery manifest`,
    );
  }
  if (
    !options.gitCheckpoint
    && options.skipGitCommits !== true
    && !fs.existsSync(path.join(configDir, '.git'))
  ) {
    throw new IncompleteMigrationError(journal, `Git checkpoint ${journal.checkpointId} is unavailable`);
  }
  if (journal.applicationVersion !== applicationVersion) {
    throw new IncompleteMigrationError(
      journal,
      `Migration ${journal.migrationId} was interrupted under Meadow ${journal.applicationVersion}; Git checkpoint ${journal.checkpointId} requires recovery before Meadow ${applicationVersion} can continue`,
    );
  }

  const prepared = findPreparedScope(scopes, journal.scope);
  if (!prepared.descriptors.some(descriptor => descriptor.id === journal.migrationId)) {
    throw new IncompleteMigrationError(journal, `Interrupted migration ${journal.migrationId} is unavailable`);
  }
  if (portableHomePath(configDir, prepared.scope.ledgerPath) !== journal.ledgerRelativePath) {
    throw new IncompleteMigrationError(journal, 'Interrupted migration references a different ledger path');
  }
  const completed = ledgerHas(prepared.loadedLedger.ledger, journal.migrationId);

  if (journal.phase === 'prepared') {
    await finishRecoveredBatch(configDir, options);
    return;
  }

  if (journal.phase === 'data-written' || journal.phase === 'ledger-written') {
    if (!completed) {
      recordCompletion(
        prepared.loadedLedger.ledger,
        journal.migrationId,
        journal.applicationVersion,
        journal.completedAt ?? new Date().toISOString(),
      );
      saveMigrationLedger(prepared.scope.ledgerPath, prepared.loadedLedger.ledger);
    }
    await finishRecoveredBatch(configDir, options);
    return;
  }

  throw new IncompleteMigrationError(
    journal,
    `Migration ${journal.migrationId} stopped while running. Preserve the Home and use Git checkpoint ${journal.checkpointId} before retrying.`,
  );
}

export async function runMigrationsForScopes(
  scopes: MigrationScope[],
  options: RunMigrationsOptions = {},
): Promise<void> {
  const applicationVersion =
    options.applicationVersion ?? process.env.MEADOW_APP_VERSION ?? '0.5.41-migration-test';
  const configDir = options.configDir ?? path.dirname(scopes[0]?.ledgerPath ?? process.cwd());
  const preparedScopes = await Promise.all(scopes.map(scope => prepareScope(scope, applicationVersion)));

  await recoverIncompleteMigration(configDir, preparedScopes, applicationVersion, options);

  const currentScopes = await Promise.all(scopes.map(scope => prepareScope(scope, applicationVersion)));
  const pending = currentScopes.flatMap(prepared =>
    prepared.descriptors.filter(descriptor => !ledgerHas(prepared.loadedLedger.ledger, descriptor.id)),
  );
  const ledgersNeedRewrite = currentScopes.some(prepared => prepared.loadedLedger.needsRewrite);
  if (pending.length === 0 && !ledgersNeedRewrite) return;

  const checkpointId = await requiredGitCheckpoint('pre', configDir, options);
  const gitGuard: MigrationGitGuard | null = options.skipGitCommits !== true
    && fs.existsSync(path.join(configDir, '.git'))
    ? captureMigrationGitGuard(configDir, checkpointId)
    : null;
  const ignoredPaths = pending.flatMap(descriptor =>
    descriptor.migration.ignoredPathRecovery?.(configDir) ?? [],
  );
  const checkpoint = createMigrationRecovery(
    configDir,
    applicationVersion,
    pending.map(item => `${item.scope.name}/${item.id}`),
    checkpointId,
    ignoredPaths,
  );
  options.faults?.afterCheckpoint?.(checkpoint);
  logger.info(`[migrations] Verified Git checkpoint ${checkpoint.checkpointId}`);

  for (const prepared of currentScopes) {
    if (prepared.loadedLedger.needsRewrite) {
      saveMigrationLedger(prepared.scope.ledgerPath, prepared.loadedLedger.ledger);
      prepared.loadedLedger.needsRewrite = false;
    }
  }

  let lastJournal: MigrationJournal | null = null;
  for (const descriptor of pending) {
    const prepared = findPreparedScope(currentScopes, descriptor.scope.name);
    let journal: MigrationJournal = {
      schemaVersion: 1,
      checkpointId: checkpoint.checkpointId,
      applicationVersion,
      scope: descriptor.scope.name,
      migrationId: descriptor.id,
      ledgerRelativePath: portableHomePath(configDir, descriptor.scope.ledgerPath),
      phase: 'prepared',
      completedAt: null,
    };
    writeMigrationJournal(configDir, journal);
    lastJournal = journal;
    options.faults?.afterPreparedJournal?.(descriptor.id);

    journal = { ...journal, phase: 'running' };
    writeMigrationJournal(configDir, journal);
    lastJournal = journal;
    options.faults?.afterRunningJournal?.(descriptor.id);
    logger.info(`[migrations] -> ${descriptor.scope.name}/${descriptor.id}`);
    try {
      await descriptor.migration.run();
    } catch (error) {
      let gitProtectionDetail = '';
      if (gitGuard) {
        try {
          assertMigrationGitGuard(configDir, gitGuard);
        } catch (gitError) {
          gitProtectionDetail = `; ${gitError instanceof Error ? gitError.message : 'protected .git metadata changed'}`;
        }
      }
      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new IncompleteMigrationError(
        journal,
        `Migration ${descriptor.id} failed while running${detail}${gitProtectionDetail}; Git checkpoint ${journal.checkpointId} is available`,
        { cause: error },
      );
    }
    try {
      if (gitGuard) assertMigrationGitGuard(configDir, gitGuard);
    } catch (error) {
      throw new IncompleteMigrationError(
        journal,
        `Migration ${descriptor.id} changed protected .git metadata; Git checkpoint ${journal.checkpointId} is available`,
        { cause: error },
      );
    }
    options.faults?.afterMigration?.(descriptor.id);

    const completedAt = new Date().toISOString();
    journal = {
      ...journal,
      phase: 'data-written',
      completedAt,
    };
    writeMigrationJournal(configDir, journal);
    lastJournal = journal;
    options.faults?.afterDataJournal?.(descriptor.id);

    recordCompletion(prepared.loadedLedger.ledger, descriptor.id, applicationVersion, completedAt);
    saveMigrationLedger(descriptor.scope.ledgerPath, prepared.loadedLedger.ledger);
    options.faults?.afterLedger?.(descriptor.id);

    journal = { ...journal, phase: 'ledger-written' };
    writeMigrationJournal(configDir, journal);
    lastJournal = journal;
    options.faults?.afterLedgerJournal?.(descriptor.id);
  }

  try {
    if (gitGuard) assertMigrationGitGuard(configDir, gitGuard);
  } catch (error) {
    if (lastJournal) {
      const blockedJournal: MigrationJournal = {
        ...lastJournal,
        phase: 'running',
        completedAt: null,
      };
      writeMigrationJournal(configDir, blockedJournal);
      throw new IncompleteMigrationError(
        blockedJournal,
        `Protected .git metadata changed before the post-migration checkpoint ${checkpointId}`,
        { cause: error },
      );
    }
    throw error;
  }
  await requiredGitCheckpoint('post', configDir, options);
  clearMigrationRecovery(configDir);
  logger.info('[migrations] ✓ Startup migrations complete');
}

export async function runMigrationsOnStartup(): Promise<void> {
  const configDir = getConfigDirectory();
  const applicationVersion = process.env.MEADOW_APP_VERSION;
  if (!applicationVersion) throw new Error('MEADOW_APP_VERSION is required for migration safety');
  await runMigrationsForScopes(discoverScopes(configDir), { configDir, applicationVersion });
}
