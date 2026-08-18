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
} from '../../../src/shared/migrations/runner.js';
import {
  IncompleteMigrationError,
  migrationRecoveryRoot,
  readMigrationJournal,
} from '../../../src/shared/migrations/migrationPersistence.js';

function makeMigrationFile(dir: string, filename: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, filename),
    body.replaceAll('__MIGRATION_ID__', filename.replace(/\.(?:ts|js)$/, '')),
    'utf8',
  );
}

function readLedger(ledgerPath: string): string[] {
  if (!fs.existsSync(ledgerPath)) return [];
  const parsed = YAML.parse(fs.readFileSync(ledgerPath, 'utf8')) as {
    completedMigrations?: Array<{ id: string }>;
  };
  return parsed.completedMigrations?.map(record => record.id) ?? [];
}

const trivialMigration = (sentinel: string): string => `
import fs from 'fs';
import path from 'path';
export const migration = {
  id: '__MIGRATION_ID__',
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
    fs.rmSync(migrationRecoveryRoot(tmp), { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('applies pending migrations from a single scope and records them in the scope ledger', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_alpha.ts', trivialMigration('alpha'));
    makeMigrationFile(scope.migrationsDir, '26_01_02_00_00_00_beta.ts', trivialMigration('beta'));

    await runMigrationsForScopes([scope], { skipGitCommits: true });

    expect(readLedger(scope.ledgerPath)).toEqual([
      '26_01_01_00_00_00_alpha',
      '26_01_02_00_00_00_beta',
    ]);
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

    makeMigrationFile(core.migrationsDir, '26_01_01_00_00_00_core.ts', trivialMigration('core'));

    // Pretend core has already run its migration in a previous boot; the
    // provider's ledger is still empty when its migrations show up later.
    fs.writeFileSync(
      core.ledgerPath,
      YAML.stringify({ completed_migrations: ['26_01_01_00_00_00_core.js'] }),
      'utf8',
    );

    makeMigrationFile(provider.migrationsDir, '26_01_02_00_00_00_provider.ts', trivialMigration('provider'));

    await runMigrationsForScopes([core, provider], { skipGitCommits: true });

    expect(readLedger(core.ledgerPath)).toEqual(['26_01_01_00_00_00_core']);
    expect(readLedger(provider.ledgerPath)).toEqual(['26_01_02_00_00_00_provider']);
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
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));

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
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_ok.ts', trivialMigration('ok'));
    makeMigrationFile(
      scope.migrationsDir,
      '26_01_02_00_00_00_boom.ts',
      `export const migration = {
        id: '__MIGRATION_ID__',
        name: 'boom',
        description: 'fails on purpose',
        run: async () => { throw new Error('intentional failure'); }
      };`,
    );
    makeMigrationFile(scope.migrationsDir, '26_01_03_00_00_00_never.ts', trivialMigration('never'));

    await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toThrow(
      /intentional failure/,
    );

    expect(readLedger(scope.ledgerPath)).toEqual(['26_01_01_00_00_00_ok']);
  });

  it.each([
    ['invalid syntax', 'completed_migrations: [broken\n', /invalid document/],
    [
      'duplicates',
      YAML.stringify({ completed_migrations: ['26_01_01_00_00_00_only.ts', '26_01_01_00_00_00_only.ts'] }),
      /invalid document/,
    ],
    [
      'unknown logical IDs',
      YAML.stringify({ completed_migrations: ['26_01_01_00_00_00_removed.ts'] }),
      /unknown logical ID/,
    ],
  ])('blocks %s in a migration ledger without running a migration', async (_name, ledger, message) => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
    fs.writeFileSync(scope.ledgerPath, ledger);
    const original = fs.readFileSync(scope.ledgerPath);

    await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toThrow(message);
    expect(fs.readFileSync(scope.ledgerPath)).toEqual(original);
    expect(fs.existsSync(path.join(tmp, 'out', 'log.txt'))).toBe(false);
  });

  it('maps a legacy TypeScript filename to the same logical ID in packaged JavaScript', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'packaged-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.js', trivialMigration('must-not-run'));
    fs.writeFileSync(
      scope.ledgerPath,
      YAML.stringify({ completed_migrations: ['26_01_01_00_00_00_only.ts'] }),
    );

    await runMigrationsForScopes([scope], { skipGitCommits: true });
    expect(readLedger(scope.ledgerPath)).toEqual(['26_01_01_00_00_00_only']);
    expect(fs.existsSync(path.join(tmp, 'out', 'log.txt'))).toBe(false);
  });

  it('deduplicates source and packaged filenames and preserves checked-in retired history', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'packaged-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_current.js', trivialMigration('must-not-run'));
    const retiredId = '25_12_05_09_03_23_zpnysy7x8wsf_add_source_graph_subdirectory';
    fs.writeFileSync(scope.ledgerPath, YAML.stringify({
      completed_migrations: [
        `${retiredId}.ts`,
        `${retiredId}.js`,
        '26_01_01_00_00_00_current.ts',
        '26_01_01_00_00_00_current.js',
      ],
    }));

    await runMigrationsForScopes([scope], { skipGitCommits: true });
    expect(readLedger(scope.ledgerPath)).toEqual([retiredId, '26_01_01_00_00_00_current']);
    expect(fs.existsSync(path.join(tmp, 'out', 'log.txt'))).toBe(false);
  });

  it('rejects a migration whose exported logical ID differs from its filename', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(
      scope.migrationsDir,
      '26_01_01_00_00_00_only.ts',
      `export const migration = { id: 'different-id', name: 'bad', description: 'bad', run() {} };`,
    );
    await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toThrow(
      /exports logical ID 'different-id'/,
    );
  });

  it.each([
    'afterPreparedJournal',
    'afterDataJournal',
    'afterLedger',
    'afterLedgerJournal',
  ] as const)(
    'recovers deterministically from an injected %s interruption without duplicate mutation',
    async boundary => {
      const scope: MigrationScope = {
        name: 'core',
        migrationsDir: path.join(tmp, 'core-migrations'),
        ledgerPath: path.join(tmp, 'core.yaml'),
      };
      makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
      await expect(
        runMigrationsForScopes([scope], {
          skipGitCommits: true,
          faults: { [boundary]: () => { throw new Error(`interrupted ${boundary}`); } },
        }),
      ).rejects.toThrow(`interrupted ${boundary}`);

      expect(readMigrationJournal(tmp)).not.toBeNull();
      await runMigrationsForScopes([scope], { skipGitCommits: true });
      expect(readMigrationJournal(tmp)).toBeNull();
      expect(readLedger(scope.ledgerPath)).toEqual(['26_01_01_00_00_00_only']);
      const mutations = fs.existsSync(path.join(tmp, 'out', 'log.txt'))
        ? fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8').trim().split('\n')
        : [];
      expect(mutations).toEqual(['only']);
    },
  );

  it.each(['afterRunningJournal', 'afterMigration'] as const)(
    'blocks an ambiguous %s interruption without rerunning the migration',
    async boundary => {
      const scope: MigrationScope = {
        name: 'core',
        migrationsDir: path.join(tmp, 'core-migrations'),
        ledgerPath: path.join(tmp, 'core.yaml'),
      };
      makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
      await expect(
        runMigrationsForScopes([scope], {
          skipGitCommits: true,
          faults: { [boundary]: () => { throw new Error(`interrupted ${boundary}`); } },
        }),
      ).rejects.toThrow(`interrupted ${boundary}`);

      await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toBeInstanceOf(
        IncompleteMigrationError,
      );
      const mutations = fs.existsSync(path.join(tmp, 'out', 'log.txt'))
        ? fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8').trim().split('\n')
        : [];
      expect(mutations).toEqual(boundary === 'afterMigration' ? ['only'] : []);
      expect(readLedger(scope.ledgerPath)).toEqual([]);
    },
  );

  it('can restart after interruption immediately after the recovery manifest', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
    let checkpointId = '';
    await expect(runMigrationsForScopes([scope], {
      skipGitCommits: true,
      faults: {
        afterCheckpoint: checkpoint => {
          checkpointId = checkpoint.checkpointId;
          throw new Error('termination after checkpoint');
        },
      },
    })).rejects.toThrow('termination after checkpoint');
    expect(readMigrationJournal(tmp)).toBeNull();
    expect(readLedger(scope.ledgerPath)).toEqual([]);
    expect(fs.existsSync(path.join(
      migrationRecoveryRoot(tmp),
      'checkpoint.json',
    ))).toBe(true);
    expect(checkpointId).toBe('0000000000000000000000000000000000000000');

    await runMigrationsForScopes([scope], { skipGitCommits: true });
    expect(readLedger(scope.ledgerPath)).toEqual(['26_01_01_00_00_00_only']);
    expect(fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8')).toBe('only\n');
  });

  it('carries unambiguous recovery state when the Home directory moves', async () => {
    const originalHome = path.join(tmp, 'Original Home');
    const movedHome = path.join(tmp, 'Moved Home');
    const originalScope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(originalHome, 'core-migrations'),
      ledgerPath: path.join(originalHome, 'core.yaml'),
    };
    makeMigrationFile(
      originalScope.migrationsDir,
      '26_01_01_00_00_00_only.ts',
      trivialMigration('only'),
    );
    await expect(runMigrationsForScopes([originalScope], {
      configDir: originalHome,
      skipGitCommits: true,
      faults: {
        afterPreparedJournal: () => { throw new Error('move the Home now'); },
      },
    })).rejects.toThrow('move the Home now');

    fs.renameSync(originalHome, movedHome);
    const movedScope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(movedHome, 'core-migrations'),
      ledgerPath: path.join(movedHome, 'core.yaml'),
    };
    await runMigrationsForScopes([movedScope], {
      configDir: movedHome,
      skipGitCommits: true,
    });

    expect(readLedger(movedScope.ledgerPath)).toEqual(['26_01_01_00_00_00_only']);
    expect(fs.existsSync(migrationRecoveryRoot(movedHome))).toBe(false);
  });

  it('blocks an ambiguous interruption after data mutation and keeps its recovery manifest', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
    await expect(
      runMigrationsForScopes([scope], {
        skipGitCommits: true,
        faults: { afterMigration: () => { throw new Error('termination after mutation'); } },
      }),
    ).rejects.toThrow('termination after mutation');
    const journal = readMigrationJournal(tmp);
    expect(journal?.phase).toBe('running');

    await expect(runMigrationsForScopes([scope], { skipGitCommits: true })).rejects.toBeInstanceOf(
      IncompleteMigrationError,
    );
    expect(fs.existsSync(path.join(
      migrationRecoveryRoot(tmp),
      'checkpoint.json',
    ))).toBe(true);
    expect(fs.readFileSync(path.join(tmp, 'out', 'log.txt'), 'utf8')).toBe('only\n');
    expect(readLedger(scope.ledgerPath)).toEqual([]);
  });

  it('copies only explicitly declared ignored paths and removes recovery state after success', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    const secretPath = path.join(tmp, 'app', 'secret.yaml');
    const unlistedPath = path.join(tmp, 'large-unlisted.bin');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, 'token: preserved\n', { mode: 0o600 });
    fs.writeFileSync(unlistedPath, Buffer.alloc(1024 * 1024, 7));
    makeMigrationFile(
      scope.migrationsDir,
      '26_01_01_00_00_00_only.ts',
      `${trivialMigration('only').replace(
        "  run: async () => {",
        "  ignoredPathRecovery: homePath => [path.join(homePath, 'app', 'secret.yaml')],\n  run: async () => {",
      )}`,
    );
    let inspectedRecovery = false;
    await runMigrationsForScopes([scope], {
      skipGitCommits: true,
      faults: {
        afterCheckpoint: checkpoint => {
          const checkpointPath = path.join(migrationRecoveryRoot(tmp), 'checkpoint.json');
          const copiedSecretPath = path.join(
            migrationRecoveryRoot(tmp),
            'ignored-files',
            'app',
            'secret.yaml',
          );
          expect(checkpoint.declaredIgnoredPaths).toEqual(['app/secret.yaml']);
          expect(checkpoint.files.map(file => file.relativePath)).toEqual(['app/secret.yaml']);
          expect(fs.existsSync(checkpointPath)).toBe(true);
          expect(fs.statSync(checkpointPath).mode & 0o777).toBe(0o600);
          expect(fs.readFileSync(copiedSecretPath, 'utf8')).toBe('token: preserved\n');
          expect(fs.statSync(copiedSecretPath).mode & 0o777).toBe(0o600);
          expect(fs.existsSync(path.join(
            migrationRecoveryRoot(tmp),
            'ignored-files',
            'large-unlisted.bin',
          ))).toBe(false);
          inspectedRecovery = true;
        },
      },
    });
    expect(inspectedRecovery).toBe(true);
    expect(fs.existsSync(migrationRecoveryRoot(tmp))).toBe(false);
  });

  it('requires pre- and post-migration Git checkpoints in order', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));
    const phases: string[] = [];

    await runMigrationsForScopes([scope], {
      gitCheckpoint: async phase => {
        phases.push(phase);
        return phase === 'pre'
          ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      },
    });

    expect(phases).toEqual(['pre', 'post']);
    expect(readLedger(scope.ledgerPath)).toEqual(['26_01_01_00_00_00_only']);
  });

  it('does not run a migration when the required pre-migration Git checkpoint fails', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    makeMigrationFile(scope.migrationsDir, '26_01_01_00_00_00_only.ts', trivialMigration('only'));

    await expect(runMigrationsForScopes([scope], {
      gitCheckpoint: async () => { throw new Error('Git checkpoint failed'); },
    })).rejects.toThrow('Git checkpoint failed');

    expect(readLedger(scope.ledgerPath)).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'out', 'log.txt'))).toBe(false);
    expect(fs.existsSync(migrationRecoveryRoot(tmp))).toBe(false);
  });

  it('blocks before the post-migration commit when a migration changes .git metadata', async () => {
    const scope: MigrationScope = {
      name: 'core',
      migrationsDir: path.join(tmp, 'core-migrations'),
      ledgerPath: path.join(tmp, 'core.yaml'),
    };
    const checkpointSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const gitDirectory = path.join(tmp, '.git');
    fs.mkdirSync(path.join(gitDirectory, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDirectory, 'objects'));
    fs.writeFileSync(path.join(gitDirectory, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(gitDirectory, 'refs', 'heads', 'main'), `${checkpointSha}\n`);
    fs.writeFileSync(path.join(gitDirectory, 'config'), '[core]\n\tbare = false\n');
    makeMigrationFile(
      scope.migrationsDir,
      '26_01_01_00_00_00_git_mutation.ts',
      `import fs from 'fs';
       import path from 'path';
       export const migration = {
         id: '__MIGRATION_ID__',
         name: 'must not touch Git',
         description: 'simulates an accidental write to protected metadata',
         run: async () => {
           const out = process.env.MIGRATION_TEST_OUT;
           if (!out) throw new Error('MIGRATION_TEST_OUT not set');
           fs.appendFileSync(path.join(path.dirname(out), '.git', 'config'), 'changed = true\\n');
         }
       };`,
    );
    const phases: string[] = [];

    await expect(runMigrationsForScopes([scope], {
      gitCheckpoint: async phase => {
        phases.push(phase);
        return checkpointSha;
      },
    })).rejects.toThrow(/changed protected \.git metadata/);

    expect(phases).toEqual(['pre']);
    expect(readMigrationJournal(tmp)?.phase).toBe('running');
    expect(readLedger(scope.ledgerPath)).toEqual([]);
  });
});
