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
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERATED_BUNDLE_VERSIONING_MIGRATION_EVIDENCE,
  migrateGeneratedBundleVersioning,
} from '../../../src/shared/migrations/versions/26_08_16_18_30_00_q7m2v9k4c6x1_generated_bundle_versioning.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-versioning-migration-'));
  temporaryDirectories.push(directory);
  return directory;
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('generated bundle versioning migration', () => {
  it('M01 M03 M06 preserves ordered IDs and frozen bytes while installing current working output', () => {
    const home = makeHome();
    const bundle = path.join(home, 'bundles', 'garden');
    write(path.join(bundle, 'config', 'bundle_config.yaml'), YAML.stringify({
      bundleGuid: 'abc1234',
      bundleCreatedAt: '2026-01-01T00:00:00.000Z',
      bundleLastPublishedAt: '2026-02-01T00:00:00.000Z',
      generatedBundleVersions: ['vAb3XyZ', 'vQ7mN2p'],
    }));
    write(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), YAML.stringify({
      versions: [
        { versionId: 'vAb3XyZ', firstPublishedAt: '2026-01-02T00:00:00.000Z', notes: 'frozen', isActive: false },
        { versionId: 'vQ7mN2p', firstPublishedAt: '2026-01-03T00:00:00.000Z', notes: '', isActive: true },
      ],
    }));
    write(path.join(bundle, 'html', 'generated_bundle_versions', 'vAb3XyZ', 'page.html'), 'frozen bytes');
    write(path.join(bundle, 'html', 'generated_bundle_versions', 'vQ7mN2p', 'page.html'), 'old current');
    write(path.join(bundle, 'html', 'generated', 'page.html'), 'working current');

    const report = migrateGeneratedBundleVersioning(home);
    expect(report).toMatchObject({ bundlesVisited: 1, versionCount: 2, generatedDirectoriesMoved: 1 });
    expect(fs.readFileSync(path.join(bundle, 'html', 'generated_bundle_versions', 'vAb3XyZ', 'page.html'), 'utf8'))
      .toBe('frozen bytes');
    expect(fs.readFileSync(path.join(bundle, 'html', 'generated_bundle_versions', 'vQ7mN2p', 'page.html'), 'utf8'))
      .toBe('working current');
    expect(fs.existsSync(path.join(bundle, 'html', 'generated'))).toBe(false);
    const manifest = YAML.parse(fs.readFileSync(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), 'utf8'));
    expect(manifest).toEqual({
      schemaVersion: 1,
      versions: [
        {
          versionId: 'vAb3XyZ',
          createdAt: '2026-01-02T00:00:00.000Z',
          notes: 'frozen',
          predecessorVersionId: null,
          readerConnectionToPredecessor: 'disconnected',
          localFilesState: 'present',
        },
        {
          versionId: 'vQ7mN2p',
          createdAt: '2026-01-03T00:00:00.000Z',
          notes: '',
          predecessorVersionId: 'vAb3XyZ',
          readerConnectionToPredecessor: 'disconnected',
          readerAwarenessState: 'legacy-incomplete',
          localFilesState: 'present',
        },
      ],
    });
    const config = YAML.parse(fs.readFileSync(path.join(bundle, 'config', 'bundle_config.yaml'), 'utf8'));
    expect(config.generatedBundleVersions).toBeUndefined();
    expect(config.bundleLastPublishedAt).toBeUndefined();

    const before = fs.readFileSync(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), 'utf8');
    expect(migrateGeneratedBundleVersioning(home).generatedDirectoriesMoved).toBe(0);
    expect(fs.readFileSync(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), 'utf8')).toBe(before);
  });

  it('M01 M02 preserves valid IDs when core runs before the historical provider storage rename', () => {
    const home = makeHome();
    const bundle = path.join(home, 'bundles', 'pre-provider');
    write(path.join(bundle, 'config', 'bundle_config.yaml'), YAML.stringify({
      bundleCreatedAt: '2026-01-01T00:00:00.000Z',
      bundleLastPublishedAt: '2026-02-01T00:00:00.000Z',
      publishVersions: ['vrSOrHy'],
    }));
    write(path.join(bundle, 'config', 'published_versions.yaml'), YAML.stringify({
      versions: [{ versionId: 'vrSOrHy', firstPublishedAt: '2026-01-02T00:00:00.000Z', isActive: true }],
    }));
    write(path.join(bundle, 'html', 'published', 'vrSOrHy', 'index.html'), 'previously published bytes');
    write(path.join(bundle, 'html', 'generated', 'index.html'), 'latest generated bytes');

    expect(migrateGeneratedBundleVersioning(home)).toMatchObject({
      versionCount: 1,
      invalidLegacyIdsReplaced: 0,
      generatedDirectoriesMoved: 1,
    });
    const manifest = YAML.parse(fs.readFileSync(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), 'utf8'));
    expect(manifest.versions[0].versionId).toBe('vrSOrHy');
    expect(fs.readFileSync(
      path.join(bundle, 'html', 'generated_bundle_versions', 'vrSOrHy', 'index.html'),
      'utf8',
    )).toBe('latest generated bytes');
    expect(fs.existsSync(path.join(bundle, 'config', 'published_versions.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(bundle, 'html', 'published'))).toBe(false);
  });

  it('V01 maps an invalid legacy ID to a valid local ID while retaining URL migration evidence', () => {
    const home = makeHome();
    const bundle = path.join(home, 'bundles', 'legacy');
    write(path.join(bundle, 'config', 'bundle_config.yaml'), YAML.stringify({
      bundleCreatedAt: '2026-01-01T00:00:00.000Z',
      bundleLastPublishedAt: '2026-02-01T00:00:00.000Z',
      generatedBundleVersions: ['v1'],
    }));
    write(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), YAML.stringify({
      versions: [{ versionId: 'v1', firstPublishedAt: '2026-01-02T00:00:00.000Z', isActive: true }],
    }));
    write(path.join(bundle, 'html', 'generated', 'index.html'), 'legacy current');

    const report = migrateGeneratedBundleVersioning(home);
    expect(report.invalidLegacyIdsReplaced).toBe(1);
    const manifest = YAML.parse(fs.readFileSync(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), 'utf8'));
    const canonicalId = manifest.versions[0].versionId as string;
    expect(canonicalId).toMatch(/^v[A-Za-z0-9]{6}$/);
    const evidence = JSON.parse(fs.readFileSync(path.join(bundle, GENERATED_BUNDLE_VERSIONING_MIGRATION_EVIDENCE), 'utf8'));
    expect(evidence.versions[0]).toMatchObject({ legacyVersionId: 'v1', canonicalVersionId: canonicalId });
  });

  it('M03 rejects a case collision before changing any bundle', () => {
    const home = makeHome();
    const safe = path.join(home, 'bundles', 'a-safe');
    const bad = path.join(home, 'bundles', 'z-bad');
    write(path.join(safe, 'config', 'bundle_config.yaml'), 'bundleGuid: safe001\n');
    write(path.join(safe, 'html', 'generated', 'index.html'), 'safe');
    write(path.join(bad, 'config', 'bundle_config.yaml'), YAML.stringify({ generatedBundleVersions: ['vAb3XyZ', 'vab3xyz'] }));
    write(path.join(bad, 'html', 'generated', 'index.html'), 'bad');

    expect(() => migrateGeneratedBundleVersioning(home)).toThrow(/case-colliding/);
    expect(fs.existsSync(path.join(safe, 'html', 'generated'))).toBe(true);
    expect(fs.existsSync(path.join(safe, 'config', 'generated_bundle_versions.yaml'))).toBe(false);
  });
});
