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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertMigrationGitGuard,
  captureMigrationGitGuard,
  MigrationGitGuardError,
} from '../../../src/shared/migrations/migrationGitGuard.js';

const CHECKPOINT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('migration Git guard', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-git-guard-test-'));
    const gitDirectory = path.join(home, '.git');
    fs.mkdirSync(path.join(gitDirectory, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDirectory, 'objects'));
    fs.writeFileSync(path.join(gitDirectory, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(gitDirectory, 'refs', 'heads', 'main'), `${CHECKPOINT_SHA}\n`);
    fs.writeFileSync(path.join(gitDirectory, 'config'), '[core]\n\tbare = false\n');
    fs.writeFileSync(path.join(gitDirectory, 'index'), Buffer.from('test-index'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('allows ordinary Home mutations while the Git control plane stays unchanged', () => {
    const guard = captureMigrationGitGuard(home, CHECKPOINT_SHA);
    fs.writeFileSync(path.join(home, 'migrated.yaml'), 'migrated: true\n');
    expect(() => assertMigrationGitGuard(home, guard)).not.toThrow();
  });

  it.each([
    ['configuration', 'config'],
    ['index', 'index'],
  ])('detects changes to Git %s', (_name, relativePath) => {
    const guard = captureMigrationGitGuard(home, CHECKPOINT_SHA);
    fs.appendFileSync(path.join(home, '.git', relativePath), 'unexpected mutation\n');
    expect(() => assertMigrationGitGuard(home, guard)).toThrow(MigrationGitGuardError);
  });

  it('detects a changed HEAD ref', () => {
    const guard = captureMigrationGitGuard(home, CHECKPOINT_SHA);
    fs.writeFileSync(
      path.join(home, '.git', 'refs', 'heads', 'main'),
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n',
    );
    expect(() => assertMigrationGitGuard(home, guard)).toThrow(/does not match pre-migration checkpoint/);
  });

  it('detects replacement of the .git directory even when its visible files are copied', () => {
    const guard = captureMigrationGitGuard(home, CHECKPOINT_SHA);
    const original = path.join(home, '.git');
    const replacement = path.join(home, '.git-replacement');
    fs.cpSync(original, replacement, { recursive: true });
    fs.renameSync(original, path.join(home, '.git-original'));
    fs.renameSync(replacement, original);
    expect(() => assertMigrationGitGuard(home, guard)).toThrow(/replaced or redirected/);
  });

  it('refuses a symlinked .git path', () => {
    const gitDirectory = path.join(home, '.git');
    const moved = path.join(home, 'git-data');
    fs.renameSync(gitDirectory, moved);
    fs.symlinkSync(moved, gitDirectory, 'dir');
    expect(() => captureMigrationGitGuard(home, CHECKPOINT_SHA)).toThrow(/must remain a real directory/);
  });
});
