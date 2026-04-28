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
import YAML from 'yaml';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import { commitChangesNative } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { getConfigDirectory } from '../routes/siteConfigRoutes.js';
import { PublishingProviderPaths } from '../../../shared_code/paths/publishingProviderPaths.js';
import { getAllBackendProviders } from '../publishing/providerRegistry.js';
import type { MigrationsYaml } from '../../../shared_code/types/migrations.js';

/**
 * Migration runner.
 *
 * Migrations are organized into independent scopes. Each scope has its own
 * directory of migration files and its own YAML ledger of completed entries:
 *
 *   - The "core" scope owns app/backend/src/migrations/versions/ and writes
 *     its ledger to <configDir>/migrations.yaml.
 *   - Each publishing provider that ships a backend/migrations/ folder gets
 *     its own scope, with the ledger living next to the provider's other
 *     config at <configDir>/app/publishing_providers/<id>/migrations.yaml.
 *
 * Scopes are independent on purpose: an extension layered in after the user
 * has already run core migrations starts with an empty ledger and applies
 * its own migrations the next time the app boots, regardless of how far
 * core has advanced. Migrations are responsible for being idempotent over
 * data that may already be in the new shape.
 *
 * Within a scope, files are applied in lexical order (the YY_MM_DD_… prefix
 * gives chronological order). Across scopes, core runs first, then each
 * provider in lexical order of provider id.
 */

export interface MigrationScope {
  /** Display label for log lines, e.g. "core" or a provider id. */
  name: string;
  /** Directory of migration .ts/.js files, scanned at boot. */
  migrationsDir: string;
  /** Path to the YAML file that records completed migrations for this scope. */
  ledgerPath: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLedger(ledgerPath: string): MigrationsYaml {
  if (!fs.existsSync(ledgerPath)) {
    return { completed_migrations: [] };
  }
  try {
    const content = fs.readFileSync(ledgerPath, 'utf8');
    const parsed = (YAML.parse(content) || {}) as Partial<MigrationsYaml>;
    return {
      completed_migrations: Array.isArray(parsed.completed_migrations)
        ? parsed.completed_migrations
        : [],
    };
  } catch (error) {
    logger.warn(`[migrations] Failed to read ${ledgerPath}, treating as empty:`, error);
    return { completed_migrations: [] };
  }
}

function saveLedger(ledgerPath: string, data: MigrationsYaml): void {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const yaml = YAML.stringify({ completed_migrations: data.completed_migrations });
  fs.writeFileSync(ledgerPath, yaml, 'utf8');
}

function listMigrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'))
    .sort();
}

function discoverScopes(configDir: string): MigrationScope[] {
  const scopes: MigrationScope[] = [];

  // Core: app/backend/{src,dist/backend/src}/migrations/versions
  scopes.push({
    name: 'core',
    migrationsDir: path.join(__dirname, 'versions'),
    ledgerPath: path.join(configDir, 'migrations.yaml'),
  });

  // Each publishing provider that ships a backend/migrations/ directory.
  // providerRegistry already enumerates the discovered providers in lexical
  // order, so this list is deterministic.
  for (const provider of getAllBackendProviders()) {
    const providerId = provider.manifest.id;
    // Walk from this file (…/migrations/runner) up to the provider's
    // backend/migrations directory in source or dist layouts.
    const providerMigrationsDir = path.resolve(
      __dirname,
      '../../../publishing_providers',
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

interface PendingMigration {
  scope: MigrationScope;
  filename: string;
}

function pendingForScope(scope: MigrationScope): PendingMigration[] {
  if (!fs.existsSync(scope.migrationsDir)) return [];
  const completed = new Set(loadLedger(scope.ledgerPath).completed_migrations);
  return listMigrationFiles(scope.migrationsDir)
    .filter((f) => !completed.has(f))
    .map((f) => ({ scope, filename: f }));
}

async function runMigration(pending: PendingMigration): Promise<void> {
  const fullPath = path.join(pending.scope.migrationsDir, pending.filename);
  logger.info(`[migrations] -> ${pending.scope.name}/${pending.filename}`);

  const mod = (await import(pathToFileURL(fullPath).href)) as {
    migration?: { run: () => Promise<void> | void };
  };
  if (!mod.migration || typeof mod.migration.run !== 'function') {
    throw new Error(`Migration ${pending.scope.name}/${pending.filename} missing export 'migration.run'`);
  }
  await mod.migration.run();

  const ledger = loadLedger(pending.scope.ledgerPath);
  if (!ledger.completed_migrations.includes(pending.filename)) {
    ledger.completed_migrations.push(pending.filename);
    saveLedger(pending.scope.ledgerPath, ledger);
  }
}

/**
 * Apply pending migrations across the given scopes. Pure with respect to
 * the surrounding app — `runMigrationsOnStartup` wires it to the live
 * config directory and registered providers; tests can pass synthetic
 * scopes against a temp directory.
 */
export async function runMigrationsForScopes(
  scopes: MigrationScope[],
  options: { skipGitCommits?: boolean; configDir?: string } = {},
): Promise<void> {
  const pending: PendingMigration[] = [];
  for (const scope of scopes) {
    pending.push(...pendingForScope(scope));
  }
  if (pending.length === 0) return;

  logger.info(`[migrations] Running ${pending.length} pending migration(s) across ${scopes.length} scope(s)`);

  const configDir = options.configDir;
  if (!options.skipGitCommits && configDir) {
    try {
      logger.info('[migrations] Creating pre-migration commit...');
      await commitChangesNative([configDir], 'migration: pre-migration - commit everything', {
        configDir,
        allowEmpty: true,
      });
    } catch (error) {
      logger.warn('[migrations] Pre-migration commit skipped:', error instanceof Error ? error.message : error);
    }
  }

  for (const item of pending) {
    try {
      await runMigration(item);
    } catch (error) {
      logger.error(`[migrations] Migration failed: ${item.scope.name}/${item.filename}`, error);
      throw error;
    }
  }

  if (!options.skipGitCommits && configDir) {
    try {
      logger.info('[migrations] Creating post-migration commit...');
      await commitChangesNative([configDir], 'migration: post-migration - all changes', {
        configDir,
        allowEmpty: true,
      });
    } catch (error) {
      logger.warn('[migrations] Post-migration commit skipped:', error instanceof Error ? error.message : error);
    }
  }

  logger.info('[migrations] ✓ Startup migrations complete');
}

export async function runMigrationsOnStartup(): Promise<void> {
  const configDir = getConfigDirectory();
  await runMigrationsForScopes(discoverScopes(configDir), { configDir });
}
