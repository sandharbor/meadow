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

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendGeneratedBundleVersion, emptyGeneratedBundleVersionManifest, requireGeneratedBundleVersionId, tombstoneGeneratedBundleVersion, updateGeneratedBundleVersionNote } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { generatedBundleVersionDirectory, loadGeneratedBundleVersionManifest, saveGeneratedBundleVersionManifest } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { selectedVersionExportSource, stageAllVersionsExport } from '../../../../../src/areas/bundle/sharing/versioning/localVersionExport.js';

describe('local generated-version export', () => {
  const firstId = requireGeneratedBundleVersionId('vAb3XyZ');
  const secondId = requireGeneratedBundleVersionId('vQ7mN2p');
  let homeDirectory: string;
  let bundleDirectory: string;

  const git = (...args: string[]): string => execFileSync('git', args, {
    cwd: homeDirectory,
    encoding: 'utf8',
  }).trim();

  function writeVersion(versionId: string, title: string): void {
    const directory = generatedBundleVersionDirectory(bundleDirectory, requireGeneratedBundleVersionId(versionId));
    fs.mkdirSync(path.join(directory, '_mw_assets', 'versioning'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), `<h1>${title}</h1>\n`, 'utf8');
    fs.writeFileSync(
      path.join(directory, '_mw_assets', 'versioning', 'routes.abc123.json'),
      `${JSON.stringify({ schemaVersion: 1, entryPath: 'index.html', routesByBundleNodeId: {}, generatedPagePaths: ['index.html'] })}\n`,
      'utf8',
    );
  }

  beforeEach(() => {
    homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-local-version-export-'));
    git('init', '-b', 'main');
    git('config', 'user.name', 'Meadow Test');
    git('config', 'user.email', 'meadow-test@example.invalid');
    bundleDirectory = path.join(homeDirectory, 'bundles', 'export-me');
    fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'publishSlug: export-me\n', 'utf8');
    writeVersion(firstId, 'First');
    writeVersion(secondId, 'Second');
    let manifest = appendGeneratedBundleVersion(emptyGeneratedBundleVersionManifest(), {
      versionId: firstId,
      createdAt: '2026-08-15T10:00:00.000Z',
      notes: '',
      readerConnectionToPredecessor: 'disconnected',
    });
    manifest = appendGeneratedBundleVersion(manifest, {
      versionId: secondId,
      createdAt: '2026-08-16T10:00:00.000Z',
      notes: '',
      readerConnectionToPredecessor: 'connected',
    });
    saveGeneratedBundleVersionManifest(bundleDirectory, manifest);
    git('add', '-A');
    git('commit', '-m', 'save generated versions');
  });

  afterEach(() => {
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  });

  it('E01 exports an explicitly selected saved version flat', () => {
    const selected = selectedVersionExportSource(bundleDirectory, firstId);
    expect(selected).toEqual({
      versionId: firstId,
      sourceDirectory: generatedBundleVersionDirectory(bundleDirectory, firstId),
    });
    expect(fs.readFileSync(path.join(selected.sourceDirectory, 'index.html'), 'utf8')).toContain('First');
  });

  it('E02 stages deterministic privacy-safe All Versions output with tombstone inventory', () => {
    const original = inspectGeneratedVersionGitState(bundleDirectory, firstId);
    let manifest = tombstoneGeneratedBundleVersion(
      loadGeneratedBundleVersionManifest(bundleDirectory),
      firstId,
      {
      localFilesDeletedAt: '2026-08-16T12:00:00.000Z',
      lastSavedGenerationId: original.savedGenerationId!,
      },
    );
    manifest = updateGeneratedBundleVersionNote(manifest, secondId, 'PRIVATE EDITORIAL NOTE');
    saveGeneratedBundleVersionManifest(bundleDirectory, manifest);
    fs.rmSync(generatedBundleVersionDirectory(bundleDirectory, firstId), { recursive: true });

    const staged = stageAllVersionsExport(bundleDirectory, 'export-me');
    try {
      expect(fs.existsSync(path.join(staged.sourceDirectory, `export-me-${firstId}`))).toBe(false);
      expect(fs.existsSync(path.join(staged.sourceDirectory, `export-me-${secondId}`, 'index.html'))).toBe(true);
      const manifestText = fs.readFileSync(path.join(staged.sourceDirectory, 'export-me-versions.json'), 'utf8');
      expect(manifestText).not.toContain('PRIVATE EDITORIAL NOTE');
      expect(JSON.parse(manifestText)).toMatchObject({
        schemaVersion: 1,
        versions: [
          { versionId: firstId, localFilesState: 'deleted' },
          { versionId: secondId, localFilesState: 'present' },
        ],
      });
    } finally {
      staged.cleanup();
    }
  });

  it('E03 blocks dirty current and All Versions while retaining frozen single export', () => {
    fs.writeFileSync(path.join(generatedBundleVersionDirectory(bundleDirectory, secondId), 'index.html'), '<h1>Dirty</h1>\n');
    expect(() => selectedVersionExportSource(bundleDirectory, secondId)).toThrow(/Save generated version/);
    expect(() => stageAllVersionsExport(bundleDirectory, 'export-me')).toThrow(/Save generated version/);
    expect(selectedVersionExportSource(bundleDirectory, firstId).versionId).toBe(firstId);
  });
});
