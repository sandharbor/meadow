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
import { createHash } from 'crypto';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_MEADOW_HOME_FORMAT_VERSION,
  MEADOW_HOME_MANIFEST_FILENAME,
  MeadowHomeCompatibilityError,
  compareAppVersions,
  meadowHomeManifestCodec,
  preflightMeadowHome,
} from '../../../../../shared_code/utils/meadowHomeFormat.js';
import { readDurableDocument, writeDurableDocument } from '../../../../../shared_code/utils/durableDocument.js';
import type { MeadowHomeManifest } from '../../../../../contracts/types/meadowHome.js';

function manifest(overrides: Partial<MeadowHomeManifest> = {}): MeadowHomeManifest {
  return {
    formatVersion: 1,
    minimumReaderAppVersion: '0.5.41',
    minimumWriterAppVersion: '0.5.41',
    createdByAppVersion: '0.5.41',
    lastWrittenByAppVersion: '0.5.41',
    capabilities: [],
    ...overrides,
  };
}

function treeDigest(directory: string): string {
  if (!fs.existsSync(directory)) return 'missing';
  const entries: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const relative = path.relative(directory, full);
      if (entry.isDirectory()) {
        entries.push(`d:${relative}`);
        walk(full);
      } else {
        entries.push(`f:${relative}:${createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`);
      }
    }
  };
  walk(directory);
  return entries.join('\n');
}

describe('Meadow Home format preflight', () => {
  let root: string;
  let home: string;
  let manifestPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-home-format-'));
    home = path.join(root, 'MeadowHome');
    manifestPath = path.join(home, MEADOW_HOME_MANIFEST_FILENAME);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates format 1 before any other state in a genuinely empty Home', () => {
    const result = preflightMeadowHome(home, '0.5.41');
    expect(result.action).toBe('created');
    expect(fs.readdirSync(home)).toEqual([MEADOW_HOME_MANIFEST_FILENAME]);
    expect(result.manifest).toMatchObject({
      formatVersion: CURRENT_MEADOW_HOME_FORMAT_VERSION,
      createdByAppVersion: '0.5.41',
      lastWrittenByAppVersion: '0.5.41',
    });
  });

  it('validates and checkpoints a legacy Home before adding its manifest', () => {
    const appConfig = path.join(home, 'app', 'app_config.yaml');
    fs.mkdirSync(path.dirname(appConfig), { recursive: true });
    fs.writeFileSync(appConfig, 'manageGitAutomatically: false\n');
    const before = fs.readFileSync(appConfig);

    const result = preflightMeadowHome(home, '0.5.42');
    expect(result.action).toBe('legacy-upgraded');
    expect(result.checkpointId).toBeTruthy();
    expect(fs.readFileSync(appConfig)).toEqual(before);
    const checkpoint = path.join(root, '.MeadowHome.meadow-recovery', 'checkpoints', result.checkpointId!);
    expect(fs.statSync(checkpoint).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(checkpoint, 'checkpoint.json')).mode & 0o777).toBe(0o600);
  });

  it('does not modify or checkpoint a malformed legacy Home', () => {
    const appConfig = path.join(home, 'app', 'app_config.yaml');
    fs.mkdirSync(path.dirname(appConfig), { recursive: true });
    fs.writeFileSync(appConfig, 'manageGitAutomatically: [broken\n');
    const before = treeDigest(home);

    expect(() => preflightMeadowHome(home, '0.5.41')).toThrow(MeadowHomeCompatibilityError);
    expect(treeDigest(home)).toBe(before);
    expect(fs.existsSync(path.join(root, '.MeadowHome.meadow-recovery'))).toBe(false);
  });

  it('makes no second-start change for the current format', () => {
    preflightMeadowHome(home, '0.5.41');
    const before = treeDigest(home);
    const result = preflightMeadowHome(home, '0.5.99');
    expect(result.action).toBe('unchanged');
    expect(treeDigest(home)).toBe(before);
  });

  it.each([
    ['future format', manifest({ formatVersion: 2 }), 'newer-format'],
    ['unknown capability', manifest({ capabilities: ['future-required-capability'] }), 'unsupported-capability'],
    ['newer writer requirement', manifest({ minimumWriterAppVersion: '9.0.0' }), 'app-too-old'],
  ])('refuses %s without changing any Home bytes', (_name, value, expectedKind) => {
    writeDurableDocument({ path: manifestPath, value, codec: meadowHomeManifestCodec });
    const before = treeDigest(home);
    try {
      preflightMeadowHome(home, '0.5.41');
      throw new Error('expected preflight to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(MeadowHomeCompatibilityError);
      expect((error as MeadowHomeCompatibilityError).kind).toBe(expectedKind);
    }
    expect(treeDigest(home)).toBe(before);
  });

  it('rejects an invalid or unknown-field manifest without normalizing it', () => {
    fs.mkdirSync(home, { recursive: true });
    const source = Buffer.from('formatVersion: 1\nunexpectedWriterRule: true\n', 'utf8');
    fs.writeFileSync(manifestPath, source);
    expect(() => preflightMeadowHome(home, '0.5.41')).toThrow(/unexpectedWriterRule/);
    expect(fs.readFileSync(manifestPath)).toEqual(source);
  });

  it('checkpoints and upgrades an older supported manifest', () => {
    const old = manifest({ formatVersion: 0, lastWrittenByAppVersion: '0.5.40' });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(manifestPath, YAML.stringify(old));
    const oldBytes = fs.readFileSync(manifestPath);
    const result = preflightMeadowHome(home, '0.5.42');
    expect(result.action).toBe('format-upgraded');
    expect(result.manifest.formatVersion).toBe(1);
    expect(result.manifest.lastWrittenByAppVersion).toBe('0.5.42');
    const checkpointCopy = path.join(
      root,
      '.MeadowHome.meadow-recovery',
      'checkpoints',
      result.checkpointId!,
      MEADOW_HOME_MANIFEST_FILENAME,
    );
    expect(fs.readFileSync(checkpointCopy)).toEqual(oldBytes);
  });

  it('requires an authoritative semantic app version', () => {
    expect(() => preflightMeadowHome(home, 'unknown')).toThrow(/semantic running application version/);
    expect(fs.existsSync(home)).toBe(false);
    expect(compareAppVersions('0.5.42-beta.1', '0.5.41')).toBe(1);
  });

  it('exposes a typed valid manifest read after initialization', () => {
    preflightMeadowHome(home, '0.5.41');
    expect(readDurableDocument(manifestPath, meadowHomeManifestCodec)).toMatchObject({
      status: 'valid',
      value: { formatVersion: 1 },
    });
  });
});
