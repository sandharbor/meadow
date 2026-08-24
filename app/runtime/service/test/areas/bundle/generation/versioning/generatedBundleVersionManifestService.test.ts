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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedBundleVersionId } from '../../../../../../../shared_code/types/generatedBundleVersioning.js';
import {
  appendGeneratedBundleVersion,
  emptyGeneratedBundleVersionManifest,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import {
  generateGeneratedBundleVersionId,
  generatedBundleVersionManifestPath,
  loadGeneratedBundleVersionManifest,
  parseGeneratedBundleVersionManifestYaml,
  saveGeneratedBundleVersionManifest,
  serializeGeneratedBundleVersionManifest,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';

describe('generated bundle version manifest service', () => {
  let bundleDirectory: string;

  beforeEach(() => {
    bundleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-version-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(bundleDirectory, { recursive: true, force: true });
  });

  it('serializes deterministically and round-trips byte-stably', () => {
    const manifest = appendGeneratedBundleVersion(emptyGeneratedBundleVersionManifest(), {
      versionId: 'vAb1234' as GeneratedBundleVersionId,
      createdAt: '2026-08-16T12:00:00.000Z',
      notes: 'A note',
    });
    const first = serializeGeneratedBundleVersionManifest(manifest);
    const second = serializeGeneratedBundleVersionManifest(parseGeneratedBundleVersionManifestYaml(first));
    expect(second).toBe(first);
    expect(first).toBe([
      'schemaVersion: 1',
      'versions:',
      '  - versionId: vAb1234',
      '    createdAt: 2026-08-16T12:00:00.000Z',
      '    notes: A note',
      '    predecessorVersionId: null',
      '    readerConnectionToPredecessor: disconnected',
      '    localFilesState: present',
      '',
    ].join('\n'));
  });

  it('loads an absent manifest as canonical empty state and atomically saves it', () => {
    expect(loadGeneratedBundleVersionManifest(bundleDirectory)).toEqual({ schemaVersion: 1, versions: [] });
    saveGeneratedBundleVersionManifest(bundleDirectory, emptyGeneratedBundleVersionManifest());
    expect(fs.readFileSync(generatedBundleVersionManifestPath(bundleDirectory), 'utf8'))
      .toBe('schemaVersion: 1\nversions: []\n');
    expect(fs.readdirSync(path.join(bundleDirectory, 'config'))).toEqual(['generated_bundle_versions.yaml']);
  });

  it('V01 retries case-insensitive collisions and produces the exact public format', () => {
    let calls = 0;
    const generated = generateGeneratedBundleVersionId(['vAAAAAA'], {
      randomBytes: () => {
        calls++;
        return calls === 1 ? Buffer.alloc(6, 0) : Buffer.from([1, 2, 3, 4, 5, 6]);
      },
    });
    expect(calls).toBe(2);
    expect(generated).toMatch(/^v[A-Za-z0-9]{6}$/);
    expect(generated.toLowerCase()).not.toBe('vaaaaaa');
  });

  it('V01 fails precisely when a random source cannot escape collisions', () => {
    expect(() => generateGeneratedBundleVersionId(['vAAAAAA'], {
      randomBytes: () => Buffer.alloc(6, 0),
      maximumAttempts: 2,
    })).toThrow(/after 2 attempts/);
  });
});
