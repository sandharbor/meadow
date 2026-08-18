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
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMigrationCheckpoint,
  migrationJournalPath,
  migrationRecoveryRoot,
  restoreMigrationCheckpoint,
  writeMigrationJournal,
} from '../../../src/shared/migrations/migrationPersistence.js';

const cleanupPaths: string[] = [];

function fixture(): { root: string; home: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-restore-test-')));
  const home = path.join(root, 'Meadow Home');
  cleanupPaths.push(root);
  fs.mkdirSync(path.join(home, 'app'), { recursive: true });
  fs.mkdirSync(path.join(home, '.git'), { recursive: true });
  fs.mkdirSync(path.join(home, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(home, 'app', 'config.yaml'), 'state: before\n');
  fs.writeFileSync(path.join(home, '.git', 'HEAD'), 'git-before');
  fs.writeFileSync(path.join(home, 'logs', 'app.log'), 'log-before');
  return { root, home };
}

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
describe('migration checkpoint restore', () => {
  it('verifies, stages, and atomically restores while retaining the replaced Home', () => {
    const { home } = fixture();
    const checkpoint = createMigrationCheckpoint(home, '0.5.41', ['migration-under-test']);
    fs.writeFileSync(path.join(home, 'app', 'config.yaml'), 'state: after\n');
    fs.writeFileSync(path.join(home, 'app', 'created-by-migration.yaml'), 'created: true\n');
    fs.writeFileSync(path.join(home, '.git', 'HEAD'), 'git-current');
    fs.writeFileSync(path.join(home, 'logs', 'app.log'), 'log-current');
    writeMigrationJournal(home, {
      schemaVersion: 1,
      checkpointId: checkpoint.checkpointId,
      applicationVersion: '0.5.41',
      scope: 'core',
      migrationId: 'migration-under-test',
      ledgerPath: path.join(home, 'migrations.yaml'),
      phase: 'running',
      sourceDataDigest: 'source',
      postDataDigest: null,
      completedAt: null,
    });

    const result = restoreMigrationCheckpoint(home, checkpoint.checkpointId, '0.5.41');
    expect(fs.readFileSync(path.join(home, 'app', 'config.yaml'), 'utf8')).toBe('state: before\n');
    expect(fs.existsSync(path.join(home, 'app', 'created-by-migration.yaml'))).toBe(false);
    expect(fs.readFileSync(path.join(home, '.git', 'HEAD'), 'utf8')).toBe('git-current');
    expect(fs.readFileSync(path.join(home, 'logs', 'app.log'), 'utf8')).toBe('log-current');
    expect(fs.readFileSync(path.join(result.preservedPreviousHomePath, 'app', 'config.yaml'), 'utf8'))
      .toBe('state: after\n');
    expect(fs.existsSync(migrationJournalPath(home))).toBe(false);
    expect(fs.existsSync(path.join(
      migrationRecoveryRoot(home),
      'checkpoints',
      result.preRestoreCheckpointId,
      'checkpoint.json',
    ))).toBe(true);
  });

  it('refuses a corrupt checkpoint before changing the current Home', () => {
    const { home } = fixture();
    const checkpoint = createMigrationCheckpoint(home, '0.5.41', ['migration-under-test']);
    fs.writeFileSync(path.join(
      migrationRecoveryRoot(home),
      'checkpoints',
      checkpoint.checkpointId,
      'data',
      'app',
      'config.yaml',
    ), 'tampered\n');
    fs.writeFileSync(path.join(home, 'app', 'config.yaml'), 'state: current\n');
    expect(() => restoreMigrationCheckpoint(home, checkpoint.checkpointId, '0.5.41'))
      .toThrow(/hash mismatch/);
    expect(fs.readFileSync(path.join(home, 'app', 'config.yaml'), 'utf8')).toBe('state: current\n');
  });
});
