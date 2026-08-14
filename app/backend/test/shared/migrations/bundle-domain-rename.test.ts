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
  canonicalBundleKey,
  migrateSitesToBundles,
} from '../../../src/shared/migrations/versions/26_08_13_13_00_00_b7n2r5k8w4q1_rename_sites_to_bundles.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-bundle-domain-migration-'));
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

describe('bundle domain migration', () => {
  it('renames domain keys without changing literal website keys', () => {
    expect(canonicalBundleKey('siteGuid')).toBe('bundleGuid');
    expect(canonicalBundleKey('entrySiteNodeId')).toBe('entryBundleNodeId');
    expect(canonicalBundleKey('site_page_count')).toBe('bundle_page_count');
    expect(canonicalBundleKey('MAX_SITE_PAGES')).toBe('MAX_BUNDLE_PAGES');
    expect(canonicalBundleKey('websiteUrl')).toBe('websiteUrl');
  });

  it('moves controlled paths and config keys while preserving slugs, values, and YAML comments', () => {
    const home = makeHome();
    const legacyBundle = path.join(home, 'sites', 'my-bundle-slug');
    write(
      path.join(legacyBundle, 'conf', 'site_config.yaml'),
      '# keep this comment\nsiteGuid: abc1234\nsiteNotes: Keep the word site in user-authored notes.\nwebsiteUrl: https://example.com\n',
    );
    write(
      path.join(legacyBundle, 'conf', 'site_node_config.yaml'),
      'nodes:\n  - siteNodeId: abc123def456\n    siteNodeName: Home\n    siteNodeKind: file\n',
    );
    write(path.join(legacyBundle, 'raw', 'tracked_site_node_config.yaml'), 'nodes: []\n');
    write(path.join(legacyBundle, 'build', 'prepared_site_node_config.yaml'), 'nodes: []\n');
    write(path.join(legacyBundle, 'html', 'generated_site_versions', 'v1', 'index.html'), '<h1>site</h1>');
    write(path.join(home, 'app', 'app_config.yaml'), 'lastSiteSlug: my-bundle-slug\nwebsiteTitle: Meadow\n');

    const firstReport = migrateSitesToBundles(home);
    const canonicalBundle = path.join(home, 'bundles', 'my-bundle-slug');
    expect(firstReport.movedPaths.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(home, 'sites'))).toBe(false);
    expect(fs.existsSync(path.join(canonicalBundle, 'conf', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(canonicalBundle, 'conf', 'bundle_node_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(canonicalBundle, 'raw', 'tracked_bundle_node_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(canonicalBundle, 'build', 'prepared_bundle_node_config.yaml'))).toBe(true);
    expect(fs.readFileSync(
      path.join(canonicalBundle, 'html', 'generated_bundle_versions', 'v1', 'index.html'),
      'utf8',
    )).toBe('<h1>site</h1>');

    const configText = fs.readFileSync(path.join(canonicalBundle, 'conf', 'bundle_config.yaml'), 'utf8');
    expect(configText).toContain('# keep this comment');
    const config = YAML.parse(configText) as Record<string, unknown>;
    expect(config).toMatchObject({
      bundleGuid: 'abc1234',
      bundleNotes: 'Keep the word site in user-authored notes.',
      websiteUrl: 'https://example.com',
    });
    expect(config).not.toHaveProperty('siteGuid');

    const nodeConfig = YAML.parse(
      fs.readFileSync(path.join(canonicalBundle, 'conf', 'bundle_node_config.yaml'), 'utf8'),
    ) as { nodes: Array<Record<string, unknown>> };
    expect(nodeConfig.nodes[0]).toMatchObject({
      bundleNodeId: 'abc123def456',
      bundleNodeName: 'Home',
      bundleNodeKind: 'file',
    });
    expect(YAML.parse(fs.readFileSync(path.join(home, 'app', 'app_config.yaml'), 'utf8')))
      .toEqual({ lastBundleSlug: 'my-bundle-slug', websiteTitle: 'Meadow' });

    expect(migrateSitesToBundles(home)).toEqual({ movedPaths: [], rewrittenConfigFiles: [] });
  });

  it('merges non-overlapping legacy and canonical bundle roots', () => {
    const home = makeHome();
    write(path.join(home, 'sites', 'legacy', 'conf', 'site_config.yaml'), 'siteGuid: old0001\n');
    write(path.join(home, 'bundles', 'canonical', 'conf', 'bundle_config.yaml'), 'bundleGuid: new0001\n');

    migrateSitesToBundles(home);

    expect(fs.existsSync(path.join(home, 'bundles', 'legacy', 'conf', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(home, 'bundles', 'canonical', 'conf', 'bundle_config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(home, 'sites'))).toBe(false);
  });

  it('refuses to overwrite conflicting legacy and canonical data', () => {
    const home = makeHome();
    write(path.join(home, 'sites', 'same-slug', 'conf', 'site_config.yaml'), 'siteGuid: old0001\n');
    write(path.join(home, 'bundles', 'same-slug', 'conf', 'bundle_config.yaml'), 'bundleGuid: new0001\n');

    expect(() => migrateSitesToBundles(home)).toThrow('different data');
    expect(fs.readFileSync(
      path.join(home, 'bundles', 'same-slug', 'conf', 'site_config.yaml'),
      'utf8',
    )).toBe('siteGuid: old0001\n');
    expect(fs.readFileSync(
      path.join(home, 'bundles', 'same-slug', 'conf', 'bundle_config.yaml'),
      'utf8',
    )).toBe('bundleGuid: new0001\n');
  });
});
