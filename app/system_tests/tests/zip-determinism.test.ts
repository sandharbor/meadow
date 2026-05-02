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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  startServer,
  stopServer,
  TEST_BASE_URL
} from '../helpers/serverManager.js';
import { SystemTestSiteSetup } from '../helpers/testSetup.js';

describe('Generated archive determinism', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  describe('markdown export ZIP', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small',
        'zip-determinism-md-export',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
      const siteConfigPath = testSetup.getPathInSite('conf/site_config.yaml');
      fs.appendFileSync(siteConfigPath, 'generationMarkdownZipEnabled: true\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('produces byte-identical ZIPs across two consecutive preview runs', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      const mdExportDir = testSetup!.getPathInSite('html/preview/_mw_assets/md-export');

      async function runPreviewAndReadZip(): Promise<{ filename: string; bytes: Buffer }> {
        const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);

        const manifestPath = path.join(mdExportDir, 'markdown-export-manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { zipFilename: string };

        const zipPath = path.join(mdExportDir, manifest.zipFilename);
        expect(fs.existsSync(zipPath)).toBe(true);
        return { filename: manifest.zipFilename, bytes: fs.readFileSync(zipPath) };
      }

      const first = await runPreviewAndReadZip();
      // Pause long enough that any mtime-sourced bytes would shift between
      // the two runs (filesystem mtime granularity is 1s on many platforms).
      await new Promise(r => setTimeout(r, 1500));
      const second = await runPreviewAndReadZip();

      const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
      const firstHash = sha(first.bytes);
      const secondHash = sha(second.bytes);

      // Filename is content-addressed, so a filename mismatch is itself a
      // determinism failure. Check it explicitly so the assertion message is
      // legible when this regresses.
      expect(second.filename).toBe(first.filename);
      expect(secondHash).toBe(firstHash);
    });
  });
});
