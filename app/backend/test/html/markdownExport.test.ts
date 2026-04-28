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
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { generateHtmlForSite } from '../../src/html/htmlService.js';
import { TestSiteSetup } from './testSetup.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import localSaveRoutes from '../../src/routes/localSaveRoutes.js';

describe('markdown export filtering', () => {
  const testSetup = new TestSiteSetup('markdown-export-site', 'markdown-export-test');
  let sitePath: string;

  beforeEach(() => {
    testSetup.setUp();
    sitePath = testSetup.getSitePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  async function createPreview() {
    await generateHtmlForSite(sitePath, { preview: true });
  }

  it('should exclude orphaned pages from the intermediate export directory and ZIP', async () => {
    await createPreview();

    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    const exportFiles = fs.readdirSync(exportDir);

    // Orphaned page should not be in the export directory
    expect(exportFiles).not.toContain('orphaned page.md');
    // Blacklisted page should also not be present (not whitelisted in traversal)
    expect(exportFiles).not.toContain('blacklisted page.md');

    // Connected page and main page should be present
    expect(exportFiles).toContain('main page.md');
    expect(exportFiles).toContain('connected page.md');

    // Verify the ZIP also excludes them
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewDir, '_mw_assets', 'md-export', 'markdown-export-manifest.json'), 'utf8')
    ) as { zipFilename: string };
    const zipPath = path.join(previewDir, '_mw_assets', 'md-export', manifest.zipFilename);

    const zipContents = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    expect(zipContents).toContain('main page.md');
    expect(zipContents).toContain('connected page.md');
    expect(zipContents).not.toContain('orphaned page.md');
    expect(zipContents).not.toContain('blacklisted page.md');
  });

  it('should replace links to non-publishable pages with _link not tracked_', async () => {
    await createPreview();

    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    const mainPageContent = fs.readFileSync(path.join(exportDir, 'main page.md'), 'utf8');

    // Untracked page link should be replaced (outside code blocks)
    expect(mainPageContent).toContain('_link not tracked_');
    // The original untracked link should only remain inside code fences/inline code
    expect(mainPageContent).toContain('- _link not tracked_');
    expect(mainPageContent).not.toMatch(/^- \[\[untracked page\]\]/m);

    // Blacklisted page link should be replaced
    expect(mainPageContent).not.toMatch(/^- \[\[blacklisted page\]\]/m);

    // Aliased link to non-tracked page should be replaced
    expect(mainPageContent).not.toContain('[[secret|alias for secret]]');
  });

  it('should preserve links to traversable pages', async () => {
    await createPreview();

    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    const mainPageContent = fs.readFileSync(path.join(exportDir, 'main page.md'), 'utf8');

    // Connected page link should remain
    expect(mainPageContent).toContain('[[connected page]]');
  });

  it('should preserve links inside code fences and inline code', async () => {
    await createPreview();

    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    const mainPageContent = fs.readFileSync(path.join(exportDir, 'main page.md'), 'utf8');

    // Links inside code fences should be preserved
    expect(mainPageContent).toContain('```\n[[untracked page]] inside a code fence\n```');
    // Links inside inline code should be preserved
    expect(mainPageContent).toContain('`[[untracked page]]`');
  });

  it('should contain exactly the right set of files in the intermediate directory', async () => {
    await createPreview();

    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    const exportFiles = fs.readdirSync(exportDir).sort();

    // Only traversable pages should be in the export
    expect(exportFiles).toEqual(['connected page.md', 'main page.md']);
  });

  describe('Advanced-tab raw markdown export (localSaveRoutes)', () => {
    const siteSlug = 'markdown-export-test';
    let app: express.Express;
    let scratchDir: string;

    beforeEach(() => {
      app = express();
      app.use(express.json());
      app.use('/api', localSaveRoutes);

      scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdexport-advanced-'));
    });

    afterEach(() => {
      if (fs.existsSync(scratchDir)) {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      }
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

  it('should clean up intermediate directory when markdownZipEnabled is false', async () => {
    // First generate with markdown zip enabled (the fixture has it enabled)
    await createPreview();
    const exportDir = SiteConfigPaths.getMarkdownExportDir(sitePath);
    expect(fs.existsSync(exportDir)).toBe(true);

    // Now disable markdown zip and regenerate
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    let configContent = fs.readFileSync(siteConfigPath, 'utf8');
    configContent = configContent.replace('generationMarkdownZipEnabled: true', 'generationMarkdownZipEnabled: false');
    fs.writeFileSync(siteConfigPath, configContent, 'utf8');

    await createPreview();

    // Intermediate directory should be cleaned up
    expect(fs.existsSync(exportDir)).toBe(false);
  });
});
