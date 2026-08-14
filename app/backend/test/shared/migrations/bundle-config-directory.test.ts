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
import { afterEach, describe, expect, it } from 'vitest';
import { migrateBundleConfToConfig } from '../../../src/shared/migrations/versions/26_08_14_13_00_00_c4g7m2p9v6x1_rename_bundle_conf_to_config.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-bundle-config-directory-migration-'));
  temporaryDirectories.push(home);
  return home;
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

describe('bundle config directory migration', () => {
  it('moves conf to config and is idempotent', () => {
    const home = makeHome();
    const bundleDirectory = path.join(home, 'bundles', 'garden');
    write(path.join(bundleDirectory, 'conf', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    write(path.join(bundleDirectory, 'conf', 'bundle_node_config.yaml'), 'nodes: []\n');

    expect(migrateBundleConfToConfig(home).movedPaths).toHaveLength(1);
    expect(fs.existsSync(path.join(bundleDirectory, 'conf'))).toBe(false);
    expect(fs.readFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'utf8'))
      .toBe('bundleGuid: abc1234\n');
    expect(fs.readFileSync(path.join(bundleDirectory, 'config', 'bundle_node_config.yaml'), 'utf8'))
      .toBe('nodes: []\n');
    expect(migrateBundleConfToConfig(home)).toEqual({ movedPaths: [] });
  });

  it('merges core configuration into an existing provider config tree', () => {
    const home = makeHome();
    const bundleDirectory = path.join(home, 'bundles', 'garden');
    write(path.join(bundleDirectory, 'conf', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    write(
      path.join(bundleDirectory, 'config', 'publishing_providers', 'ExampleProvider', 'pp_config.yaml'),
      'publishSlug: garden\n',
    );

    migrateBundleConfToConfig(home);

    expect(fs.existsSync(path.join(bundleDirectory, 'conf'))).toBe(false);
    expect(fs.existsSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(
      bundleDirectory,
      'config',
      'publishing_providers',
      'ExampleProvider',
      'pp_config.yaml',
    ))).toBe(true);
  });

  it('removes an identical legacy duplicate while retaining the canonical file', () => {
    const home = makeHome();
    const bundleDirectory = path.join(home, 'bundles', 'garden');
    write(path.join(bundleDirectory, 'conf', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');
    write(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'bundleGuid: abc1234\n');

    const report = migrateBundleConfToConfig(home);

    expect(report.movedPaths[0]).toContain('identical destination retained');
    expect(fs.existsSync(path.join(bundleDirectory, 'conf'))).toBe(false);
    expect(fs.readFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), 'utf8'))
      .toBe('bundleGuid: abc1234\n');
  });

  it('rejects conflicts before moving any bundle data', () => {
    const home = makeHome();
    const conflictingBundle = path.join(home, 'bundles', 'conflicting');
    const safeBundle = path.join(home, 'bundles', 'safe');
    write(path.join(conflictingBundle, 'conf', 'bundle_config.yaml'), 'bundleGuid: old0001\n');
    write(path.join(conflictingBundle, 'config', 'bundle_config.yaml'), 'bundleGuid: new0001\n');
    write(path.join(safeBundle, 'conf', 'bundle_config.yaml'), 'bundleGuid: safe001\n');

    expect(() => migrateBundleConfToConfig(home)).toThrow('different data');
    expect(fs.existsSync(path.join(conflictingBundle, 'conf', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(safeBundle, 'conf', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(safeBundle, 'config'))).toBe(false);
  });
});
