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
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedBundleVersionId } from '../../../../../../../shared_code/types/generatedBundleVersioning.js';
import {
  compareGeneratedBundleVersionTrees,
  deriveSavedGenerationId,
  inspectGeneratedVersionGitState,
  restoreGeneratedVersionFromGit,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';

const VERSION_ID = 'vAb1234' as GeneratedBundleVersionId;
const SECOND_VERSION_ID = 'vCd5678' as GeneratedBundleVersionId;

describe('generated bundle version Git identity and integrity', () => {
  let homeDirectory: string;
  let bundleDirectory: string;
  let versionDirectory: string;

  const git = (...args: string[]): string => execFileSync('git', args, {
    cwd: homeDirectory,
    encoding: 'utf8',
  }).trim();

  const commitAll = (message: string): void => {
    git('add', '-A');
    git('commit', '-m', message);
  };

  beforeEach(() => {
    homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-version-git-'));
    git('init', '-b', 'main');
    git('config', 'user.name', 'Meadow Test');
    git('config', 'user.email', 'meadow-test@example.invalid');
    bundleDirectory = path.join(homeDirectory, 'bundles', 'example');
    versionDirectory = path.join(bundleDirectory, 'html', 'generated_bundle_versions', VERSION_ID);
    fs.mkdirSync(path.join(versionDirectory, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(versionDirectory, 'index.html'), '<h1>Initial</h1>\n');
    fs.writeFileSync(path.join(versionDirectory, 'nested', 'naïve page.html'), '<p>Unicode</p>\n');
    const executablePath = path.join(versionDirectory, 'worker.sh');
    fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(executablePath, 0o755);
    commitAll('save generated version');
  });

  afterEach(() => {
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  });

  it('G01 returns the exact HEAD subtree tree ID for nested, Unicode, and executable files', () => {
    const expected = git('rev-parse', `HEAD:bundles/example/html/generated_bundle_versions/${VERSION_ID}`);
    expect(deriveSavedGenerationId(bundleDirectory, VERSION_ID)).toBe(expected);
    expect(inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID)).toEqual({
      savedGenerationId: expected,
      isSaved: true,
      changes: [],
    });
  });

  it('G01 follows Git semantics by ignoring empty directories', () => {
    const before = deriveSavedGenerationId(bundleDirectory, VERSION_ID);
    fs.mkdirSync(path.join(versionDirectory, 'empty-directory'));
    expect(inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID).isSaved).toBe(true);
    expect(deriveSavedGenerationId(bundleDirectory, VERSION_ID)).toBe(before);
  });

  it('G02 unrelated repository commits and working changes do not affect generation identity', () => {
    const before = deriveSavedGenerationId(bundleDirectory, VERSION_ID);
    fs.writeFileSync(path.join(homeDirectory, 'unrelated.txt'), 'first\n');
    commitAll('unrelated commit');
    fs.writeFileSync(path.join(homeDirectory, 'unrelated.txt'), 'dirty\n');
    expect(deriveSavedGenerationId(bundleDirectory, VERSION_ID)).toBe(before);
    expect(inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID).isSaved).toBe(true);
  });

  it('G03 manifest-only note edits do not dirty generated content', () => {
    const configDirectory = path.join(bundleDirectory, 'config');
    fs.mkdirSync(configDirectory, { recursive: true });
    fs.writeFileSync(path.join(configDirectory, 'generated_bundle_versions.yaml'), 'notes: changed\n');
    expect(inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID).isSaved).toBe(true);
  });

  it('G04 recognizes a manual Git save only after the subtree becomes clean at HEAD', () => {
    const filePath = path.join(versionDirectory, 'index.html');
    fs.writeFileSync(filePath, '<h1>Manual edit</h1>\n');
    const dirty = inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID);
    expect(dirty.isSaved).toBe(false);
    expect(dirty.savedGenerationId).not.toBeNull();
    commitAll('manual save');
    const saved = inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID);
    expect(saved.isSaved).toBe(true);
    expect(saved.savedGenerationId).toBe(git('rev-parse', `HEAD:bundles/example/html/generated_bundle_versions/${VERSION_ID}`));
  });

  it('G05 reports tracked, untracked, ignored, deleted, and mode changes and restores exact saved bytes', () => {
    fs.writeFileSync(path.join(homeDirectory, '.gitignore'), '*.ignored\n');
    commitAll('add ignore rule');
    fs.writeFileSync(path.join(versionDirectory, 'index.html'), '<h1>Modified</h1>\n');
    fs.rmSync(path.join(versionDirectory, 'nested', 'naïve page.html'));
    fs.chmodSync(path.join(versionDirectory, 'worker.sh'), 0o644);
    fs.writeFileSync(path.join(versionDirectory, 'extra.txt'), 'extra\n');
    fs.writeFileSync(path.join(versionDirectory, 'secret.ignored'), 'ignored but still an integrity problem\n');

    const dirty = inspectGeneratedVersionGitState(bundleDirectory, VERSION_ID);
    expect(dirty.isSaved).toBe(false);
    expect(dirty.changes.map((change) => change.relativePath)).toEqual([
      'extra.txt',
      'index.html',
      'nested/naïve page.html',
      'secret.ignored',
      'worker.sh',
    ]);

    const restored = restoreGeneratedVersionFromGit(bundleDirectory, VERSION_ID);
    expect(restored.isSaved).toBe(true);
    expect(fs.readFileSync(path.join(versionDirectory, 'index.html'), 'utf8')).toBe('<h1>Initial</h1>\n');
    expect(fs.readFileSync(path.join(versionDirectory, 'nested', 'naïve page.html'), 'utf8')).toBe('<p>Unicode</p>\n');
    expect(fs.statSync(path.join(versionDirectory, 'worker.sh')).mode & 0o111).not.toBe(0);
    expect(fs.existsSync(path.join(versionDirectory, 'extra.txt'))).toBe(false);
    expect(fs.existsSync(path.join(versionDirectory, 'secret.ignored'))).toBe(false);
  });

  it('compares saved version trees and the current working generation by relative path', () => {
    const secondDirectory = path.join(bundleDirectory, 'html', 'generated_bundle_versions', SECOND_VERSION_ID);
    fs.mkdirSync(secondDirectory, { recursive: true });
    fs.writeFileSync(path.join(secondDirectory, 'index.html'), '<h1>Second</h1>\n');
    fs.writeFileSync(path.join(secondDirectory, 'added.html'), '<p>Added</p>\n');
    commitAll('save second generated version');

    expect(compareGeneratedBundleVersionTrees(bundleDirectory, VERSION_ID, { versionId: SECOND_VERSION_ID }))
      .toEqual([
        { status: 'added', relativePath: 'added.html' },
        { status: 'modified', relativePath: 'index.html' },
        { status: 'deleted', relativePath: 'nested/naïve page.html' },
        { status: 'deleted', relativePath: 'worker.sh' },
      ]);
    fs.writeFileSync(path.join(secondDirectory, 'index.html'), '<h1>Working</h1>\n');
    fs.rmSync(path.join(secondDirectory, 'added.html'));
    expect(compareGeneratedBundleVersionTrees(bundleDirectory, VERSION_ID, { workingCurrentVersionId: SECOND_VERSION_ID }))
      .toEqual([
        { status: 'modified', relativePath: 'index.html' },
        { status: 'deleted', relativePath: 'nested/naïve page.html' },
        { status: 'deleted', relativePath: 'worker.sh' },
      ]);
  });
});
