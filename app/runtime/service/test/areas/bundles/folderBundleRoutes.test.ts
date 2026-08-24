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

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleConfig } from '../../../../../shared_code/types/bundleConfig.js';
import bundleListingRoutes from '../../../src/areas/bundles/routes/bundleListingRoutes.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-bundle-routes-'));
  temporaryDirectories.push(home);
  fs.mkdirSync(path.join(home, 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'app', 'app_config.yaml'),
    YAML.stringify({ version: '1.0.0', manageGitAutomatically: false }),
    'utf8',
  );
  return home;
}

afterEach(() => {
  delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('folder-bundle routes', () => {
  it('enables generated folder navigation on newly created folder bundles', async () => {
    const home = makeHome();
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
    const sourceDirectory = path.join(home, 'source');
    fs.mkdirSync(path.join(sourceDirectory, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, 'Notes', 'Entry.md'), '# Entry\n', 'utf8');

    const app = express();
    app.use(express.json());
    app.use('/api', bundleListingRoutes);

    const preflightResponse = await request(app)
      .post('/api/bundles/folders/preflight')
      .send({
        sourceDirectory,
        selectedFolders: ['Notes'],
        bundleName: 'Folder Bundle',
      })
      .expect(200);
    const preflight = preflightResponse.body as {
      fingerprint: string;
      plan: Record<string, unknown> & { sourceDirectory: string };
    };

    await request(app)
      .post('/api/bundles/folders')
      .send({
        slug: 'folder-bundle',
        sourceDirectory: preflight.plan.sourceDirectory,
        selectedFolders: ['Notes'],
        bundleName: 'Folder Bundle',
        fingerprint: preflight.fingerprint,
        plan: preflight.plan,
      })
      .expect(200);

    const configPath = path.join(home, 'bundles', 'folder-bundle', 'config', 'bundle_config.yaml');
    const bundleConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
    expect(bundleConfig.generationFolderNavigationEnabled).toBe(true);
  });

  it('updates bundle-wide traversal defaults without adding folder overrides', async () => {
    const home = makeHome();
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
    const sourceDirectory = path.join(home, 'source');
    fs.mkdirSync(path.join(sourceDirectory, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, 'Notes', 'Entry.md'), '# Entry\n', 'utf8');

    const app = express();
    app.use(express.json());
    app.use('/api', bundleListingRoutes);

    const preflightResponse = await request(app)
      .post('/api/bundles/folders/preflight')
      .send({
        sourceDirectory,
        selectedFolders: ['Notes'],
        bundleName: 'Folder Bundle',
        defaultOutlinksDepth: 1,
        defaultInlinksDepth: 0,
      })
      .expect(200);
    const preflight = preflightResponse.body as {
      fingerprint: string;
      plan: Record<string, unknown> & { sourceDirectory: string };
    };

    await request(app)
      .post('/api/bundles/folders')
      .send({
        slug: 'folder-bundle-defaults',
        sourceDirectory,
        selectedFolders: ['Notes'],
        bundleName: 'Folder Bundle',
        fingerprint: preflight.fingerprint,
        plan: preflight.plan,
      })
      .expect(200);

    const updateResponse = await request(app)
      .put('/api/bundles/folder-bundle-defaults')
      .send({
        sourceDirectory: preflight.plan.sourceDirectory,
        entryBundleNodeName: 'Notes',
        bundleNotes: 'Wider traversal',
        defaultOutlinksDepth: 4,
        defaultInlinksDepth: 2,
      });
    expect(updateResponse.status, JSON.stringify(updateResponse.body)).toBe(200);

    const configPath = path.join(home, 'bundles', 'folder-bundle-defaults', 'config', 'bundle_config.yaml');
    const nodeConfigPath = path.join(home, 'bundles', 'folder-bundle-defaults', 'config', 'bundle_node_config.yaml');
    const bundleConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
    const nodeConfig = YAML.parse(fs.readFileSync(nodeConfigPath, 'utf8')) as {
      nodes: Array<{ outlinksDepth?: number; inlinksDepth?: number }>;
    };

    expect(bundleConfig.defaultOutlinksDepth).toBe(4);
    expect(bundleConfig.defaultInlinksDepth).toBe(2);
    expect(bundleConfig.bundleNotes).toBe('Wider traversal');
    expect(nodeConfig.nodes).toHaveLength(1);
    expect(nodeConfig.nodes[0].outlinksDepth).toBeUndefined();
    expect(nodeConfig.nodes[0].inlinksDepth).toBeUndefined();
  });
});
