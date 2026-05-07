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
import LZString from 'lz-string';
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

  function getMarkdownExportZipPath(): string {
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewDir, '_mw_assets', 'md-export', 'markdown-export-manifest.json'), 'utf8')
    ) as { zipFilename: string };
    return path.join(previewDir, '_mw_assets', 'md-export', manifest.zipFilename);
  }

  function addReachableExcalidrawDrawing() {
    const mainPagePath = path.join(sitePath, 'raw', 'tracked_page_content', 'main page.md');
    fs.appendFileSync(mainPagePath, '\n\nEmbedded drawing:\n![[drawing.excalidraw]]\n', 'utf8');

    const pageConfigPath = path.join(sitePath, 'conf', 'site_page_config.yaml');
    fs.appendFileSync(
      pageConfigPath,
      [
        '',
        '  - fileType: excalidraw',
        '    inlinksDepth: 0',
        '    listType: whitelist',
        '    outlinksDepth: 1',
        '    title: drawing',
        '',
      ].join('\n'),
      'utf8'
    );

    const scene = {
      type: 'excalidraw',
      version: 2,
      source: 'https://github.com/zsviczian/obsidian-excalidraw-plugin',
      elements: [
        { id: 'safeText', type: 'text', text: '[[connected page]]', originalText: '[[connected page]]', hasTextLink: true, link: '[[connected page]]' },
        { id: 'unsafeText', type: 'text', text: '[[blacklisted page]]', originalText: '[[blacklisted page]]', hasTextLink: true, link: '[[blacklisted page]]' },
        { id: 'missingText', type: 'text', text: '[[untracked page]]', originalText: '[[untracked page]]', hasTextLink: true, link: '[[untracked page]]' },
        { id: 'shapeSafe', type: 'rectangle', link: '[[connected page]]' },
        { id: 'shapeUnsafe', type: 'rectangle', link: '[[blacklisted page]]' },
        { id: 'shapeMissing', type: 'ellipse', link: '[[untracked page]]' },
      ],
      appState: { gridSize: null, viewBackgroundColor: '#ffffff' },
      files: {},
    };
    const compressedScene = LZString.compressToBase64(JSON.stringify(scene));

    fs.writeFileSync(
      path.join(sitePath, 'raw', 'tracked_page_content', 'drawing.excalidraw.md'),
      [
        '---',
        'excalidraw-plugin: parsed',
        '---',
        '',
        '# Drawing',
        '',
        '```compressed-json',
        compressedScene,
        '```',
        '',
        '# Text Elements',
        '',
        '[[connected page]] ^safeText',
        '[[blacklisted page]] ^unsafeText',
        '[[untracked page]] ^missingText',
        '',
        '# Element Links',
        '',
        'shapeSafe: [[connected page]]',
        'shapeUnsafe: [[blacklisted page]]',
        'shapeMissing: [[untracked page]]',
        '',
      ].join('\n'),
      'utf8'
    );
  }

  function readCompressedScene(content: string): { elements: Array<{ id: string; text?: string; originalText?: string; link?: string | null; hasTextLink?: boolean }> } {
    const match = content.match(/```compressed-json\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    const json = LZString.decompressFromBase64(match?.[1].replace(/\s+/g, '') || '');
    expect(json).toBeTruthy();
    return JSON.parse(json || '{}') as { elements: Array<{ id: string; text?: string; originalText?: string; link?: string | null; hasTextLink?: boolean }> };
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
    const zipPath = getMarkdownExportZipPath();

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

  it('should render scrubbed links with the link-not-tracked HTML class', async () => {
    await createPreview();

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const mainPageHtml = fs.readFileSync(path.join(previewDir, 'main page.html'), 'utf8');

    expect(mainPageHtml).toContain('<span class="link-not-tracked">link not tracked</span>');
    expect(mainPageHtml).not.toContain('<em>link not tracked</em>');
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

  it('should export reachable Excalidraw markdown from scrubbed source content', async () => {
    addReachableExcalidrawDrawing();

    await createPreview();

    const scrubbedPath = path.join(
      SiteConfigPaths.getScrubbedSourceContentDir(sitePath),
      'drawing.excalidraw.md'
    );
    expect(fs.existsSync(scrubbedPath)).toBe(true);

    const scrubbedContent = fs.readFileSync(scrubbedPath, 'utf8');
    expect(scrubbedContent).toContain('[[connected page]] ^safeText');
    expect(scrubbedContent).toContain('shapeSafe: [[connected page]]');
    expect(scrubbedContent).toContain('link not tracked ^unsafeText');
    expect(scrubbedContent).toContain('link not tracked ^missingText');
    expect(scrubbedContent).not.toContain('[[blacklisted page]]');
    expect(scrubbedContent).not.toContain('[[untracked page]]');
    expect(scrubbedContent).not.toContain('shapeUnsafe:');
    expect(scrubbedContent).not.toContain('shapeMissing:');

    const scene = readCompressedScene(scrubbedContent);
    const byId = Object.fromEntries(scene.elements.map(element => [element.id, element]));
    expect(byId.safeText.link).toBe('[[connected page]]');
    expect(byId.unsafeText.text).toBe('link not tracked');
    expect(byId.unsafeText.originalText).toBe('link not tracked');
    expect(byId.unsafeText.link).toBeNull();
    expect(byId.unsafeText.hasTextLink).toBe(false);
    expect(byId.missingText.text).toBe('link not tracked');
    expect(byId.shapeUnsafe.link).toBeNull();
    expect(byId.shapeMissing.link).toBeNull();

    const markdownExportPath = path.join(SiteConfigPaths.getMarkdownExportDir(sitePath), 'drawing.excalidraw.md');
    expect(fs.readFileSync(markdownExportPath, 'utf8')).toBe(scrubbedContent);

    const previewSourcePath = path.join(SiteConfigPaths.getPreviewDir(sitePath), 'drawing.excalidraw.md');
    expect(fs.readFileSync(previewSourcePath, 'utf8')).toBe(scrubbedContent);

    const zipPath = getMarkdownExportZipPath();
    const zipContents = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    expect(zipContents).toContain('drawing.excalidraw.md');

    const zippedDrawing = execFileSync('unzip', ['-p', zipPath, 'drawing.excalidraw.md'], { encoding: 'utf8' });
    expect(zippedDrawing).toBe(scrubbedContent);
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
