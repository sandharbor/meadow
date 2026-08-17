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
import path from 'path';
import LZString from 'lz-string';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { makeBundleNodeConfig } from '../../../../shared/support/bundleNodeConfigTestUtils.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

describe('sources export filtering', () => {
  const testSetup = new TestBundleSetup('shared/fixtures/sources-export-bundle', 'sources-export-test');
  let bundlePath: string;

  beforeEach(() => {
    testSetup.setUp();
    bundlePath = testSetup.getBundlePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  async function createPreview() {
    await generateHtmlForBundle(bundlePath, {
      preview: true,
      outputDirectory: getGeneratedBundleTestOutputDirectory(bundlePath),
    });
  }

  function getSourcesExportZipPath(): string {
    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(generatedHtmlDir, '_mw_assets', 'cust', 'sources-export', 'sources-export-manifest.json'), 'utf8')
    ) as { zipFilename: string; downloadFilename: string };
    expect(manifest.downloadFilename).toBe('sources-export-test-sources.zip');
    return path.join(generatedHtmlDir, '_mw_assets', 'cust', 'sources-export', manifest.zipFilename);
  }

  function addReachableExcalidrawDrawing() {
    const mainPagePath = path.join(bundlePath, 'raw', 'tracked_page_content', 'main page.md');
    fs.appendFileSync(mainPagePath, '\n\nEmbedded drawing:\n![[drawing.excalidraw]]\n', 'utf8');

    const pageConfigPath = path.join(bundlePath, 'config', 'bundle_node_config.yaml');
    const configs = parseBundleNodeConfig(fs.readFileSync(pageConfigPath, 'utf8'), pageConfigPath);
    configs.push(makeBundleNodeConfig('drawing', 'whitelist', {
      fileType: 'excalidraw',
      outlinksDepth: 1,
      inlinksDepth: 0,
    }));
    fs.writeFileSync(pageConfigPath, stringifyBundleNodeConfig(configs), 'utf8');

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
      path.join(bundlePath, 'raw', 'tracked_page_content', 'drawing.excalidraw.md'),
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

    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
    const exportFiles = fs.readdirSync(exportDir);

    // Orphaned page should not be in the export directory
    expect(exportFiles).not.toContain('orphaned page.md');
    // Blacklisted page should also not be present (not whitelisted in traversal)
    expect(exportFiles).not.toContain('blacklisted page.md');

    // Connected page and main page should be present
    expect(exportFiles).toContain('main page.md');
    expect(exportFiles).toContain('connected page.md');

    // Verify the ZIP also excludes them
    const zipPath = getSourcesExportZipPath();

    const zipContents = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    expect(zipContents).toContain('sources-export-test/main page.md');
    expect(zipContents).toContain('sources-export-test/connected page.md');
    expect(zipContents).not.toContain('orphaned page.md');
    expect(zipContents).not.toContain('blacklisted page.md');
  });

  it('should replace links to non-publishable pages with _link not tracked_', async () => {
    await createPreview();

    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
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

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const mainPageHtml = fs.readFileSync(path.join(generatedHtmlDir, 'main page.html'), 'utf8');

    expect(mainPageHtml).toContain('<span class="link-not-tracked">link not tracked</span>');
    expect(mainPageHtml).not.toContain('<em>link not tracked</em>');
  });

  it('should preserve links to traversable pages', async () => {
    await createPreview();

    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
    const mainPageContent = fs.readFileSync(path.join(exportDir, 'main page.md'), 'utf8');

    // Connected page link should remain
    expect(mainPageContent).toContain('[[connected page]]');
  });

  it('should preserve links inside code fences and inline code', async () => {
    await createPreview();

    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
    const mainPageContent = fs.readFileSync(path.join(exportDir, 'main page.md'), 'utf8');

    // Links inside code fences should be preserved
    expect(mainPageContent).toContain('```\n[[untracked page]] inside a code fence\n```');
    // Links inside inline code should be preserved
    expect(mainPageContent).toContain('`[[untracked page]]`');
  });

  it('should contain exactly the right set of files in the intermediate directory', async () => {
    await createPreview();

    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
    const exportFiles = fs.readdirSync(exportDir).sort();

    // Only traversable pages should be in the export
    expect(exportFiles).toEqual(['connected page.md', 'main page.md']);
  });

  it('should export reachable Excalidraw markdown from scrubbed source content', async () => {
    addReachableExcalidrawDrawing();

    await createPreview();

    const scrubbedPath = path.join(
      BundleConfigPaths.getScrubbedSourceContentDir(bundlePath),
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

    const sourcesExportPath = path.join(BundleConfigPaths.getSourcesExportDir(bundlePath), 'drawing.excalidraw.md');
    expect(fs.readFileSync(sourcesExportPath, 'utf8')).toBe(scrubbedContent);

    const generatedHtmlSourcePath = path.join(getGeneratedBundleTestOutputDirectory(bundlePath), 'drawing.excalidraw.md');
    expect(fs.readFileSync(generatedHtmlSourcePath, 'utf8')).toBe(scrubbedContent);

    const zipPath = getSourcesExportZipPath();
    const zipContents = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    expect(zipContents).toContain('sources-export-test/drawing.excalidraw.md');

    const zippedDrawing = execFileSync('unzip', ['-p', zipPath, 'sources-export-test/drawing.excalidraw.md'], { encoding: 'utf8' });
    expect(zippedDrawing).toBe(scrubbedContent);
  });

  it('should clean up intermediate directory when sourcesExportEnabled is false', async () => {
    // First generate with sources export enabled (the fixture has it enabled)
    await createPreview();
    const exportDir = BundleConfigPaths.getSourcesExportDir(bundlePath);
    expect(fs.existsSync(exportDir)).toBe(true);

    // Now disable sources export and regenerate
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    let configContent = fs.readFileSync(bundleConfigPath, 'utf8');
    configContent = configContent.replace('generationMarkdownZipEnabled: true', 'generationMarkdownZipEnabled: false');
    fs.writeFileSync(bundleConfigPath, configContent, 'utf8');

    await createPreview();

    // Intermediate directory should be cleaned up
    expect(fs.existsSync(exportDir)).toBe(false);
  });
});
