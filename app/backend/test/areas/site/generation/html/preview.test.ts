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
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateHtmlForSite } from '../../../../../src/areas/site/generation/html/htmlService.js';
import { TestSiteSetup } from '../../../../shared/support/testSiteSetup.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';

describe('html preview', () => {
  const testSetup = new TestSiteSetup('areas/site/generation/fixtures/minimal-site', 'minimal-test-site');
  const excalidrawInitialSetup = new TestSiteSetup('areas/site/generation/fixtures/excalidraw-initial-site', 'excalidraw-initial-test-site');
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

  it('generates site search assets and a sharded index by default', async () => {
    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    const searchDirectory = path.join(previewFolderPath, '_mw_assets', 'search');
    const indexDirectory = path.join(searchDirectory, 'index');
    const searchFiles = fs.readdirSync(searchDirectory);
    const searchJs = searchFiles.find(filename => /^search\.[a-f0-9]{8}\.js$/.test(filename));
    const searchCss = searchFiles.find(filename => /^search\.[a-f0-9]{8}\.css$/.test(filename));
    expect(searchJs).toBeDefined();
    expect(searchCss).toBeDefined();
    const searchJsDigest = createHash('sha256')
      .update(fs.readFileSync(path.join(searchDirectory, searchJs!)))
      .digest('hex')
      .slice(0, 8);
    const searchCssDigest = createHash('sha256')
      .update(fs.readFileSync(path.join(searchDirectory, searchCss!)))
      .digest('hex')
      .slice(0, 8);
    expect(searchJs).toBe(`search.${searchJsDigest}.js`);
    expect(searchCss).toBe(`search.${searchCssDigest}.css`);
    expect(searchFiles).not.toContain('search.js');
    expect(searchFiles).not.toContain('search.css');
    expect(fs.existsSync(path.join(indexDirectory, 'manifest.js'))).toBe(true);
    expect(fs.readdirSync(indexDirectory).some(filename => /^shard-[a-f0-9]{2}\.js$/.test(filename))).toBe(true);

    const mainPageHtml = fs.readFileSync(path.join(previewFolderPath, 'main page.html'), 'utf8');
    expect(mainPageHtml).toContain('data-meadow-search-open');
    expect(mainPageHtml).toContain('aria-label="Search this site"');
    expect(mainPageHtml).toContain('<svg viewBox="0 0 24 24"');
    expect(mainPageHtml).not.toContain('>Search</button>');
    expect(mainPageHtml).toContain(`_mw_assets/search/${searchJs}`);
    expect(mainPageHtml).toContain(`_mw_assets/search/${searchCss}`);

    const shardContents = fs.readdirSync(indexDirectory)
      .filter(filename => filename.startsWith('shard-'))
      .map(filename => fs.readFileSync(path.join(indexDirectory, filename), 'utf8'))
      .join('\n');
    expect(shardContents).toContain('"t":"main page"');
    expect(shardContents).toContain('This is the main page for the minimal test site.');
  });

  it('omits all search UI and index assets when search is disabled for the site', async () => {
    fs.appendFileSync(
      path.join(sitePath, 'conf', 'site_config.yaml'),
      '\ngenerationSearchEnabled: false\n',
      'utf8'
    );

    await generateHtmlForSite(sitePath, { preview: true });

    const previewFolderPath = SiteConfigPaths.getPreviewDir(sitePath);
    expect(fs.existsSync(path.join(previewFolderPath, '_mw_assets', 'search'))).toBe(false);
    const mainPageHtml = fs.readFileSync(path.join(previewFolderPath, 'main page.html'), 'utf8');
    expect(mainPageHtml).not.toContain('data-meadow-search-open');
    expect(mainPageHtml).not.toMatch(/search\/search(?:\.[a-f0-9]{8})?\.js/);
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
