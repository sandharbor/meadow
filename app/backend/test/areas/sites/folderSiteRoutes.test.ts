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
import type { SiteConfig } from '../../../../shared_code/types/siteConfig.js';
import siteListingRoutes from '../../../src/areas/sites/routes/siteListingRoutes.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-site-routes-'));
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

describe('folder-site routes', () => {
  it('enables generated folder navigation on newly created folder sites', async () => {
    const home = makeHome();
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
    const sourceDirectory = path.join(home, 'source');
    fs.mkdirSync(path.join(sourceDirectory, 'Notes'), { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, 'Notes', 'Entry.md'), '# Entry\n', 'utf8');

    const app = express();
    app.use(express.json());
    app.use('/api', siteListingRoutes);

    const preflightResponse = await request(app)
      .post('/api/sites/folders/preflight')
      .send({
        sourceDirectory,
        selectedFolders: ['Notes'],
        siteName: 'Folder Site',
      })
      .expect(200);
    const preflight = preflightResponse.body as {
      fingerprint: string;
      plan: Record<string, unknown>;
    };

    await request(app)
      .post('/api/sites/folders')
      .send({
        slug: 'folder-site',
        sourceDirectory,
        selectedFolders: ['Notes'],
        siteName: 'Folder Site',
        fingerprint: preflight.fingerprint,
        plan: preflight.plan,
      })
      .expect(200);

    const configPath = path.join(home, 'sites', 'folder-site', 'conf', 'site_config.yaml');
    const siteConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as SiteConfig;
    expect(siteConfig.generationFolderNavigationEnabled).toBe(true);
  });
});
