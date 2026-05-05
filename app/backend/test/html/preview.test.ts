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
import fs from 'fs';
import path from 'path';
import { generateHtmlForSite } from '../../src/html/htmlService.js';
import { TestSiteSetup } from './testSetup.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';

describe('html preview', () => {
  const testSetup = new TestSiteSetup('minimal-site', 'minimal-test-site');
  const excalidrawInitialSetup = new TestSiteSetup('excalidraw-initial-site', 'excalidraw-initial-test-site');
  let sitePath: string;

  beforeEach(() => {
    testSetup.setUp();
    sitePath = testSetup.getSitePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  it('should not create a publish folder', async () => {
    // Check that preview folder does not exist before generating HTML
    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    expect(fs.existsSync(previewFolderPath)).toBe(false);

    // Generate HTML with preview option
    await generateHtmlForSite(sitePath, { preview: true });

    // Check that html folder exists
    const htmlFolderPath = SiteConfigPaths.getHtmlDir(sitePath);
    expect(fs.existsSync(htmlFolderPath)).toBe(true);

    // Check that preview folder exists
    expect(fs.existsSync(previewFolderPath)).toBe(true);

    // Check that publish folder does NOT exist
    const publishFolderPath = SiteConfigPaths.getGeneratedSiteVersionsDir(sitePath);
    expect(fs.existsSync(publishFolderPath)).toBe(false);

    // Additional assertion: check that preview folder contains HTML files
    const previewFiles = fs.readdirSync(previewFolderPath);
    const htmlFiles = previewFiles.filter(file => file.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);
  });

  it('should generate HTML files and assets in preview folder', async () => {
    // Generate HTML with preview option
    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    const previewFiles = fs.readdirSync(previewFolderPath);

    // Should contain HTML files
    const htmlFiles = previewFiles.filter(file => file.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);

    // Should contain _mw_assets directory
    expect(previewFiles).toContain('_mw_assets');

    // Assets should be inside _mw_assets subdirectory
    const assetsDir = path.join(previewFolderPath, '_mw_assets');
    const assetFiles = fs.readdirSync(assetsDir);

    // Should contain CSS file
    expect(assetFiles.some(f => /^style\.[a-f0-9]{8}\.css$/i.test(f))).toBe(true);

    // Should contain JavaScript files
    expect(assetFiles.some(f => /^javascript\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);
    expect(assetFiles.some(f => /^mermaid\.min\.[a-f0-9]{8}\.js$/i.test(f))).toBe(true);

    // Should contain fonts directory
    expect(assetFiles).toContain('fonts');

    // Verify specific expected HTML files based on the test data
    // (the 'main page' should be generated since it's the defaultTraversalSitePageTitle)
    expect(htmlFiles).toContain('main page.html');
  });

  it('emits an Excalidraw initial page as the first rendered preview page', async () => {
    testSetup.tearDown();
    excalidrawInitialSetup.setUp();

    try {
      const startPages: Array<{ title: string; directory: string; relativeHtmlPath: string }> = [];

      await generateHtmlForSite(excalidrawInitialSetup.getSitePath(), {
        preview: true,
        onStartPageRendered: info => startPages.push(info),
      });

      expect(startPages).toEqual([
        {
          title: 'meadow flower',
          directory: '',
          relativeHtmlPath: 'meadow flower.html',
        },
      ]);

      const previewFolderPath = SiteConfigPaths.getPreviewDir(excalidrawInitialSetup.getSitePath());
      expect(fs.existsSync(path.join(previewFolderPath, 'meadow flower.html'))).toBe(true);
      expect(fs.existsSync(path.join(previewFolderPath, 'embedded media.html'))).toBe(true);
    } finally {
      excalidrawInitialSetup.tearDown();
    }
  });
});
