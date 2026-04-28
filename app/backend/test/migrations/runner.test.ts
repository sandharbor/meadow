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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import {
  runMigrationsForScopes,
  type MigrationScope,
} from '../../src/migrations/runner.js';

function makeMigrationFile(dir: string, filename: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), body, 'utf8');
}

function readLedger(ledgerPath: string): string[] {
  if (!fs.existsSync(ledgerPath)) return [];
  const parsed = YAML.parse(fs.readFileSync(ledgerPath, 'utf8')) as {
    completed_migrations?: string[];
  };
  return parsed.completed_migrations ?? [];
}

const trivialMigration = (sentinel: string): string => `
import fs from 'fs';
import path from 'path';
export const migration = {
  name: 'test ${sentinel}',
  description: 'records a sentinel file so the test can detect it ran',
  run: async () => {
    const out = process.env.MIGRATION_TEST_OUT;
    if (!out) throw new Error('MIGRATION_TEST_OUT not set');
    fs.mkdirSync(out, { recursive: true });
    fs.appendFileSync(path.join(out, 'log.txt'), '${sentinel}\\n');
  }
};
`;

describe('runMigrationsForScopes', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-runner-test-'));
    process.env.MIGRATION_TEST_OUT = path.join(tmp, 'out');
  });

  afterEach(() => {
    delete process.env.MIGRATION_TEST_OUT;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('applies pending migrations from a single scope and records them in the scope ledger', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '01_alpha.ts', trivialMigration('alpha'));
    makeMigrationFile(scope.migrationsDir, '02_beta.ts', trivialMigration('beta'));

    await runMigrationsForScopes([scope], { skipGitCommits: true });

    expect(readLedger(scope.ledgerPath)).toEqual(['01_alpha.ts', '02_beta.ts']);
    const log = fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8');
    expect(log.split('\n').filter(Boolean)).toEqual(['alpha', 'beta']);
  });

  it('keeps each scope on its own ledger so an extension layered in later still applies its migrations', async () => {
    const core: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    const provider: MigrationScope = {
      name: 'TestProvider',
      migrationsDir: path.join(tmp, 'provider-migrations'),
      ledgerPath: path.join(tmp, 'provider.yaml'),
    };

    makeMigrationFile(core.migrationsDir, '01_core.ts', trivialMigration('core'));

    // Pretend core has already run its migration in a previous boot; the
    // provider's ledger is still empty when its migrations show up later.
    fs.writeFileSync(core.ledgerPath, YAML.stringify({ completed_migrations: ['01_core.ts'] }), 'utf8');

    makeMigrationFile(provider.migrationsDir, '01_provider.ts', trivialMigration('provider'));

    await runMigrationsForScopes([core, provider], { skipGitCommits: true });

    expect(readLedger(core.ledgerPath)).toEqual(['01_core.ts']);
    expect(readLedger(provider.ledgerPath)).toEqual(['01_provider.ts']);
    const log = fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8');
    // Core stayed put, provider's lone migration ran.
    expect(log.split('\n').filter(Boolean)).toEqual(['provider']);
  });

  it('does not re-run migrations that are already in the ledger', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '01_only.ts', trivialMigration('only'));

    await runMigrationsForScopes([scope], { skipGitCommits: true });
    await runMigrationsForScopes([scope], { skipGitCommits: true });

    const log = fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8');
    expect(log.split('\n').filter(Boolean)).toEqual(['only']);
  });

  it('throws and does not record the failing migration in the ledger', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '01_ok.ts', trivialMigration('ok'));
    makeMigrationFile(
      scope.migrationsDir,
      '02_boom.ts',
      `export const migration = {
        name: 'boom',
        description: 'fails on purpose',
        run: async () => { throw new Error('intentional failure'); }
      };`,
    );
    makeMigrationFile(scope.migrationsDir, '03_never.ts', trivialMigration('never'));

    await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toThrow(
      /intentional failure/,
    );

    expect(readLedger(scope.ledgerPath)).toEqual(['01_ok.ts']);
  });
});
