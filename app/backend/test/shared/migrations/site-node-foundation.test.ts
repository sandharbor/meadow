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
import express from 'express';
import request from 'supertest';
import {
  migrateBundleNodeFoundation,
  type BundleNodeMigrationOptions,
} from '../../../src/shared/migrations/versions/26_08_11_12_00_00_n4k7p2w9c5x8_site_node_foundation.js';
import { migrateSitesToBundles } from '../../../src/shared/migrations/versions/26_08_13_13_00_00_b7n2r5k8w4q1_rename_sites_to_bundles.js';
import { migrateBundleConfToConfig } from '../../../src/shared/migrations/versions/26_08_14_13_00_00_c4g7m2p9v6x1_rename_bundle_conf_to_config.js';
import type { BundleNodeId } from '../../../../shared_code/types/bundleNodeConfig.js';
import { parseBundleNodeConfig } from '../../../../shared_code/utils/bundleNodeConfigUtils.js';
import bundleConfigRoutes from '../../../src/areas/bundle/curation/routes/bundleConfigRoutes.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-site-node-migration-'));
  temporaryDirectories.push(home);
  return home;
}

function writeYaml(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(value), 'utf8');
}

function setupSite(home: string, slug: string, options: {
  pages: Array<Record<string, unknown>>;
  draftPages?: Array<Record<string, unknown>>;
  siteConfig?: Record<string, unknown>;
  sources?: string[];
}): { confDir: string; sourceDirectory: string } {
  const confDir = path.join(home, 'sites', slug, 'conf');
  const sourceDirectory = path.join(home, 'source', slug);
  fs.mkdirSync(sourceDirectory, { recursive: true });
  for (const relativePath of options.sources ?? []) {
    const filePath = path.join(sourceDirectory, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `# ${relativePath}\n`, 'utf8');
  }
  writeYaml(path.join(confDir, 'site_page_config.yaml'), { pages: options.pages });
  if (options.draftPages) {
    writeYaml(path.join(confDir, 'draft_site_page_config.yaml'), { pages: options.draftPages });
  }
  writeYaml(path.join(confDir, 'site_config.yaml'), {
    sourceDirectory,
    initialSitePageTitle: 'Entry',
    initialSitePageDirectory: '',
    ...options.siteConfig,
  });
  return { confDir, sourceDirectory };
}

function deterministicIds(): BundleNodeMigrationOptions['generateId'] {
  let next = 1;
  return existingIds => {
    const existing = new Set(existingIds);
    while (true) {
      const candidate = `n${String(next).padStart(11, '0')}` as BundleNodeId;
      next += 1;
      if (!existing.has(candidate)) return candidate;
    }
  };
}

afterEach(() => {
  delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('site-node foundation startup migration', () => {
  it('jointly migrates committed and draft configs, shares IDs, moves entry depths, and reports approved cleanups', () => {
    const home = makeHome();
    const { confDir } = setupSite(home, 'garden', {
      sources: ['Entry.md', 'Notes/Draft only.md'],
      pages: [
        { title: 'Photo', fileType: 'png', listType: 'blacklist' },
        { title: 'Missing source', listType: 'whitelist' },
        { title: 'Entry', listType: 'whitelist', outlinksDepth: 3, inlinksDepth: 1 },
        { title: 'Untracked', fileType: 'md', listType: 'whitelist', tracked: false },
      ],
      draftPages: [
        { title: 'Entry', listType: 'whitelist', outlinksDepth: 8, inlinksDepth: 2 },
        {
          title: 'Draft only',
          sourceGraphSubdirectory: 'Notes',
          fileType: 'md',
          listType: 'blacklist',
        },
      ],
    });

    const report = migrateBundleNodeFoundation(home, { generateId: deterministicIds() });
    const committedPath = path.join(confDir, 'bundle_node_config.yaml');
    const draftPath = path.join(confDir, 'draft_bundle_node_config.yaml');
    const committed = parseBundleNodeConfig(fs.readFileSync(committedPath, 'utf8'), committedPath);
    const draft = parseBundleNodeConfig(fs.readFileSync(draftPath, 'utf8'), draftPath);
    const siteConfig = YAML.parse(fs.readFileSync(path.join(confDir, 'site_config.yaml'), 'utf8'));

    expect(report.migratedBundles).toEqual(['garden']);
    expect(report.cleanups.map(cleanup => cleanup.reason)).toEqual([
      'missing-file-type-source-not-found',
      'tracked-false',
    ]);
    expect(committed.map(node => node.bundleNodeName)).toEqual(['Entry', 'Photo']);
    expect(committed.find(node => node.bundleNodeName === 'Entry')?.fileType).toBe('md');
    expect(draft.find(node => node.bundleNodeName === 'Entry')?.bundleNodeId)
      .toBe(committed.find(node => node.bundleNodeName === 'Entry')?.bundleNodeId);
    expect(draft.find(node => node.bundleNodeName === 'Draft only')?.listType).toBe('blacklist');
    expect(committed.find(node => node.bundleNodeName === 'Entry')).not.toHaveProperty('outlinksDepth');
    expect(draft.find(node => node.bundleNodeName === 'Entry')).not.toHaveProperty('inlinksDepth');
    expect(siteConfig).toMatchObject({
      entryBundleNodeId: committed.find(node => node.bundleNodeName === 'Entry')?.bundleNodeId,
      defaultTraversalBundleNodeId: committed.find(node => node.bundleNodeName === 'Entry')?.bundleNodeId,
      defaultOutlinksDepth: 3,
      defaultInlinksDepth: 1,
    });
    expect(siteConfig).not.toHaveProperty('initialSitePageTitle');
    expect(fs.existsSync(path.join(confDir, 'site_page_config.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(confDir, 'draft_site_page_config.yaml'))).toBe(false);
  });

  it('is byte-idempotent after a successful migration', () => {
    const home = makeHome();
    const { confDir } = setupSite(home, 'garden', {
      sources: ['Entry.md'],
      pages: [{ title: 'Entry', fileType: 'md', listType: 'whitelist' }],
    });
    migrateBundleNodeFoundation(home, { generateId: deterministicIds() });
    const files = ['bundle_node_config.yaml', 'site_config.yaml'];
    const before = files.map(file => fs.readFileSync(path.join(confDir, file), 'utf8'));

    migrateBundleNodeFoundation(home, {
      generateId: () => { throw new Error('an idempotent retry must not generate IDs'); },
    });

    expect(files.map(file => fs.readFileSync(path.join(confDir, file), 'utf8'))).toEqual(before);
  });

  it('supports canonical draft save and discard after migration while enforcing role holders', async () => {
    const home = makeHome();
    setupSite(home, 'garden', {
      sources: ['Entry.md', 'Notes.md'],
      pages: [
        { title: 'Entry', fileType: 'md', listType: 'whitelist' },
        { title: 'Notes', fileType: 'md', listType: 'whitelist' },
      ],
    });
    migrateBundleNodeFoundation(home, { generateId: deterministicIds() });
    migrateSitesToBundles(home);
    migrateBundleConfToConfig(home);
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
    const configDir = path.join(home, 'bundles', 'garden', 'config');

    const app = express();
    app.use(express.json());
    app.use('/api', bundleConfigRoutes);
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: 'invalid canonical configuration' });
    });

    const committedPath = path.join(configDir, 'bundle_node_config.yaml');
    const draftPath = path.join(configDir, 'draft_bundle_node_config.yaml');
    const committed = parseBundleNodeConfig(fs.readFileSync(committedPath, 'utf8'), committedPath);
    const entry = committed.find(node => node.bundleNodeName === 'Entry')!;

    await request(app)
      .post('/api/bundles/garden/curation/bundle-config')
      .send({ configs: committed.map(node => node.bundleNodeId === entry.bundleNodeId ? { ...node, listType: 'blacklist' } : node), isDraft: true })
      .expect(400);
    expect(fs.existsSync(draftPath)).toBe(false);

    const editedDraft = committed.map(node => node.bundleNodeId === entry.bundleNodeId
      ? { ...node, outlinksDepth: 7 }
      : node);
    await request(app)
      .post('/api/bundles/garden/curation/bundle-config')
      .send({ configs: editedDraft, isDraft: true })
      .expect(200);
    expect(parseBundleNodeConfig(fs.readFileSync(draftPath, 'utf8'), draftPath)).toEqual(editedDraft);

    await request(app)
      .delete('/api/bundles/garden/curation/bundle-config-draft')
      .expect(200);
    expect(fs.existsSync(draftPath)).toBe(false);
    expect(parseBundleNodeConfig(fs.readFileSync(committedPath, 'utf8'), committedPath)).toEqual(committed);
  });

  it('reuses IDs written before an interruption and retires legacy inputs only after validation', () => {
    const home = makeHome();
    const { confDir } = setupSite(home, 'garden', {
      pages: [{ title: 'Entry', fileType: 'md', listType: 'whitelist' }],
    });
    let interrupted = false;
    expect(() => migrateBundleNodeFoundation(home, {
      generateId: deterministicIds(),
      afterWrite: filePath => {
        if (!interrupted && filePath.endsWith('bundle_node_config.yaml')) {
          interrupted = true;
          throw new Error('simulated interruption');
        }
      },
    })).toThrow('simulated interruption');
    const writtenId = parseBundleNodeConfig(
      fs.readFileSync(path.join(confDir, 'bundle_node_config.yaml'), 'utf8'),
    )[0].bundleNodeId;
    expect(fs.existsSync(path.join(confDir, 'site_page_config.yaml'))).toBe(true);

    migrateBundleNodeFoundation(home, {
      generateId: () => { throw new Error('retry must reuse the canonical ID'); },
    });

    expect(parseBundleNodeConfig(fs.readFileSync(path.join(confDir, 'bundle_node_config.yaml'), 'utf8'))[0].bundleNodeId)
      .toBe(writtenId);
    expect(fs.existsSync(path.join(confDir, 'site_page_config.yaml'))).toBe(false);
  });

  it('selects the unique Markdown role candidate when title and directory match several file nodes', () => {
    const home = makeHome();
    const { confDir } = setupSite(home, 'garden', {
      pages: [
        { title: 'Entry', fileType: 'png', listType: 'whitelist' },
        { title: 'Entry', fileType: 'md', listType: 'whitelist' },
      ],
    });
    migrateBundleNodeFoundation(home, { generateId: deterministicIds() });
    const nodes = parseBundleNodeConfig(fs.readFileSync(path.join(confDir, 'bundle_node_config.yaml'), 'utf8'));
    const siteConfig = YAML.parse(fs.readFileSync(path.join(confDir, 'site_config.yaml'), 'utf8'));
    expect(siteConfig.entryBundleNodeId).toBe(nodes.find(node => node.fileType === 'md')?.bundleNodeId);
  });

  it('selects a unique Excalidraw role candidate over a same-basename rendered asset', () => {
    const home = makeHome();
    const { confDir } = setupSite(home, 'drawing', {
      pages: [
        {
          title: 'Entry',
          fileType: 'excalidraw',
          listType: 'whitelist',
          outlinksDepth: 3,
          inlinksDepth: 1,
        },
        { title: 'Entry', fileType: 'svg', listType: 'whitelist' },
      ],
      siteConfig: { defaultTraversalSitePageTitle: 'Entry' },
    });

    migrateBundleNodeFoundation(home, { generateId: deterministicIds() });

    const nodes = parseBundleNodeConfig(fs.readFileSync(path.join(confDir, 'bundle_node_config.yaml'), 'utf8'));
    const siteConfig = YAML.parse(fs.readFileSync(path.join(confDir, 'site_config.yaml'), 'utf8'));
    const drawingNode = nodes.find(node => node.fileType === 'excalidraw');
    expect(siteConfig).toMatchObject({
      entryBundleNodeId: drawingNode?.bundleNodeId,
      defaultTraversalBundleNodeId: drawingNode?.bundleNodeId,
      defaultOutlinksDepth: 3,
      defaultInlinksDepth: 1,
    });
    expect(drawingNode).not.toHaveProperty('outlinksDepth');
    expect(nodes.find(node => node.fileType === 'svg')).toBeDefined();
  });

  it('fails closed for an ambiguous or missing strong role without replacing legacy files', () => {
    const ambiguousHome = makeHome();
    const { confDir: ambiguousConf } = setupSite(ambiguousHome, 'ambiguous', {
      pages: [
        { title: 'Entry', fileType: 'png', listType: 'whitelist' },
        { title: 'Entry', fileType: 'pdf', listType: 'whitelist' },
      ],
    });
    expect(() => migrateBundleNodeFoundation(ambiguousHome, { generateId: deterministicIds() }))
      .toThrow("field 'initialSitePageTitle': is ambiguous across configured nodes");
    expect(fs.existsSync(path.join(ambiguousConf, 'bundle_node_config.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(ambiguousConf, 'site_page_config.yaml'))).toBe(true);

    const missingHome = makeHome();
    setupSite(missingHome, 'missing', {
      pages: [{ title: 'Other', fileType: 'md', listType: 'whitelist' }],
      siteConfig: { defaultTraversalSitePageTitle: 'Gone' },
    });
    expect(() => migrateBundleNodeFoundation(missingHome, { generateId: deterministicIds() }))
      .toThrow("field 'initialSitePageTitle': does not resolve to a configured node");
  });

  it('fails when an explicit default traversal target is missing', () => {
    const home = makeHome();
    setupSite(home, 'garden', {
      pages: [{ title: 'Entry', fileType: 'md', listType: 'whitelist' }],
      siteConfig: { defaultTraversalSitePageTitle: 'Gone' },
    });
    expect(() => migrateBundleNodeFoundation(home, { generateId: deterministicIds() }))
      .toThrow("field 'defaultTraversalSitePageTitle': does not resolve to a configured node");
  });
});
