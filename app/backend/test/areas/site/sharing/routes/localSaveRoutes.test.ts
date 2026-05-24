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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import localSaveRoutes from '../../../../../src/areas/site/sharing/routes/localSaveRoutes.js';
import { TestSiteSetup } from '../../../../shared/support/testSiteSetup.js';

describe('Advanced-tab raw markdown export (localSaveRoutes)', () => {
  const siteSlug = 'markdown-export-test';
  const testSetup = new TestSiteSetup('shared/fixtures/markdown-export-site', siteSlug);
  let app: express.Express;
  let scratchDir: string;

  beforeEach(() => {
    testSetup.setUp();

    app = express();
    app.use(express.json());
    app.use('/api', localSaveRoutes);

    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdexport-advanced-'));
  });

  afterEach(() => {
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
    testSetup.tearDown();
  });

  it('create-zip with sourceType=raw should exclude orphaned and blacklisted pages from the ZIP', async () => {
    const zipDestination = path.join(scratchDir, 'tracked-raw-markdown.zip');

    const response = await request(app)
      .post(`/api/site/${siteSlug}/create-zip`)
      .send({ sourceType: 'raw', destinationPath: zipDestination })
      .expect(200);

    const finalZipPath = (response.body as { path: string }).path;
    expect(fs.existsSync(finalZipPath)).toBe(true);

    const zipContents = execFileSync('unzip', ['-l', finalZipPath], { encoding: 'utf8' });

    expect(zipContents).toContain('main page.md');
    expect(zipContents).toContain('connected page.md');
    expect(zipContents).not.toContain('orphaned page.md');
    expect(zipContents).not.toContain('blacklisted page.md');
  });

  it('copy-to-directory with sourceType=raw should exclude orphaned and blacklisted pages from the destination', async () => {
    const destDir = path.join(scratchDir, 'copied');
    fs.mkdirSync(destDir, { recursive: true });

    const response = await request(app)
      .post(`/api/site/${siteSlug}/copy-to-directory`)
      .send({ sourceType: 'raw', destinationPath: destDir })
      .expect(200);

    const exportPath = (response.body as { exportPath: string }).exportPath;
    expect(fs.existsSync(exportPath)).toBe(true);

    const copiedFiles = fs.readdirSync(exportPath);
    expect(copiedFiles).toContain('main page.md');
    expect(copiedFiles).toContain('connected page.md');
    expect(copiedFiles).not.toContain('orphaned page.md');
    expect(copiedFiles).not.toContain('blacklisted page.md');
  });
});
