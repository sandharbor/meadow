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
import { generateHtmlForSite, publishToVersionedDirectory, publishToNewVersion } from '../../src/html/htmlService.js';
import { ensureTrackedPageContent } from '../../src/utils/trackedPageContentUtils.js';
import { loadSiteConfig } from '../../src/utils/siteConfigUtils.js';
import { TestSiteSetup } from './testSetup.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';

describe('html publish', () => {
  const testSetup = new TestSiteSetup('minimal-site', 'minimal-test-site');
  let sitePath: string;

  beforeEach(() => {
    testSetup.setUp();
    sitePath = testSetup.getSitePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  async function createPreviewFolder() {
    await generateHtmlForSite(sitePath, { preview: true });
  }

  it('should create a publish folder if it does not exist yet', async () => {
    // The preview folder needs to already exist
    await createPreviewFolder();

    await generateHtmlForSite(sitePath, { publish: true });

    // Check that publish folder exists
    const publishFolderPath = SiteConfigPaths.getGeneratedSiteVersionsDir(sitePath);
    expect(fs.existsSync(publishFolderPath)).toBe(true);

    const confPath = SiteConfigPaths.getConfDir(sitePath);
    // the generated_site_versions.yaml file should have been created
    const publishedVersionsPath = path.join(confPath, 'generated_site_versions.yaml');
    expect(fs.existsSync(publishedVersionsPath)).toBe(true);
  });

  it('should keep page HTML stable when markdown export is enabled', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(siteConfigPath, '\ngenerationMarkdownZipEnabled: true\n', 'utf8');

    await createPreviewFolder();

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const htmlFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html')).sort();
    expect(htmlFiles.length).toBeGreaterThan(0);

    const firstHtmlPath = path.join(previewDir, htmlFiles[0]);
    const firstHtml = fs.readFileSync(firstHtmlPath, 'utf8');
    const manifestPath = path.join(previewDir, '_mw_assets', 'md-export', 'markdown-export-manifest.json');

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(firstHtml).toContain('data-markdown-zip-manifest-url="_mw_assets/md-export/markdown-export-manifest.json"');
    expect(firstHtml).not.toMatch(/markdown-export-[a-f0-9]{12}\.zip/);

    await createPreviewFolder();

    const secondHtml = fs.readFileSync(firstHtmlPath, 'utf8');
    expect(secondHtml).toBe(firstHtml);
  });

  it('should include spaced repetition assets and page metadata when enabled', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(siteConfigPath, '\ngenerationSpacedRepetitionEnabled: true\n', 'utf8');

    await createPreviewFolder();

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const htmlFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html')).sort();
    expect(htmlFiles.length).toBeGreaterThan(0);

    const firstHtml = fs.readFileSync(path.join(previewDir, htmlFiles[0]), 'utf8');
    expect(firstHtml).toContain('data-meadow-srs-site-guid="x3d9p0k"');
    expect(firstHtml).toContain('data-meadow-srs-page-id=');
    expect(firstHtml).toMatch(/srs\/srs\.[a-f0-9]{8}\.css/);
    expect(firstHtml).toMatch(/srs\/srs\.[a-f0-9]{8}\.js/);
  });

  it('should render SRS cards from modified markdown and export original markdown in zip', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(
      siteConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(sitePath, 'raw', 'tracked_page_content', 'main page.md');
    fs.writeFileSync(
      mainPagePath,
      [
        '# Main Page',
        '',
        '#srs',
        '',
        'What color is [[another page]]?::Blue',
        '<!--SR:!2026-03-12,3,250-->',
      ].join('\n'),
      'utf8'
    );

    await createPreviewFolder();

    const rawTrackedMainPage = fs.readFileSync(mainPagePath, 'utf8');
    const guidMatch = rawTrackedMainPage.match(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/);
    expect(guidMatch).not.toBeNull();
    expect(rawTrackedMainPage).toContain('<!--SR:!2026-03-12,3,250-->');

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const previewHtml = fs.readFileSync(path.join(previewDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`data-meadow-srs-site-guid="x3d9p0k"`);
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}" kind="basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What color is <a href="another%20page.html">another page</a>?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>Blue</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewDir, '_mw_assets', 'md-export', 'markdown-export-manifest.json'), 'utf8')
    ) as { zipFilename: string };
    const zipPath = path.join(previewDir, '_mw_assets', 'md-export', manifest.zipFilename);
    const zippedMarkdown = execFileSync('unzip', ['-p', zipPath, 'main page.md'], {
      encoding: 'utf8',
    });

    // The markdown export preserves original source content but strips SR
    // scheduling comments when SRS is enabled (they are Obsidian-local metadata).
    expect(zippedMarkdown).toContain(`<!--MEADOW_SR_GUID:${guidMatch![1]}-->`);
    expect(zippedMarkdown).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

  it('should backfill missing SRS GUIDs into tracked source files before syncing tracked markdown', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(
      siteConfigPath,
      '\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const sourceDir = path.join(sitePath, 'source_graphs', 'minimal-site-data');
    fs.mkdirSync(sourceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sourceDir, 'main page.md'),
      [
        '# Main Page',
        '',
        '#srs',
        '',
        'What color is the sky?::Blue',
        '<!--SR:!2026-03-12,3,250-->',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(sourceDir, 'another page.md'),
      [
        '# Another Page',
        '',
        '#notes',
        '',
        'This prompt should not be touched::Because the page tag does not match.',
        '<!--SR:!2026-03-12,3,250-->',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(sourceDir, 'child page.md'),
      '# Child Page\n',
      'utf8'
    );

    await ensureTrackedPageContent(sitePath, sourceDir);

    const sourceMainPagePath = path.join(sourceDir, 'main page.md');
    const sourceMainMarkdown = fs.readFileSync(sourceMainPagePath, 'utf8');
    const sourceGuidMatch = sourceMainMarkdown.match(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/);
    expect(sourceGuidMatch).not.toBeNull();
    expect(sourceMainMarkdown).toContain(`<!--SR:!2026-03-12,3,250-->\n\n<!--MEADOW_SR_GUID:${sourceGuidMatch![1]}-->`);

    const trackedMainPagePath = path.join(sitePath, 'raw', 'tracked_page_content', 'main page.md');
    const trackedMainMarkdown = fs.readFileSync(trackedMainPagePath, 'utf8');
    expect(trackedMainMarkdown).toContain(`<!--MEADOW_SR_GUID:${sourceGuidMatch![1]}-->`);

    const sourceAnotherMarkdown = fs.readFileSync(path.join(sourceDir, 'another page.md'), 'utf8');
    expect(sourceAnotherMarkdown).not.toContain('<!--MEADOW_SR_GUID:');

    const trackedAnotherMarkdown = fs.readFileSync(
      path.join(sitePath, 'raw', 'tracked_page_content', 'another page.md'),
      'utf8'
    );
    expect(trackedAnotherMarkdown).not.toContain('<!--MEADOW_SR_GUID:');

    await createPreviewFolder();

    const previewHtml = fs.readFileSync(path.join(SiteConfigPaths.getPreviewDir(sitePath), 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${sourceGuidMatch![1]}" kind="basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What color is the sky?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>Blue</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

  it('should render multiline ? cards and add GUIDs before SR comments even when blank lines separate them', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(
      siteConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(sitePath, 'raw', 'tracked_page_content', 'main page.md');
    fs.writeFileSync(
      mainPagePath,
      [
        '# Main Page',
        '',
        '#srs',
        '',
        'What does [[another page|Another Page]] orchestrate?',
        '?',
        'All agents across all [[child page|Child Page]].',
        '',
        '',
        '<!--SR:!2026-03-10,3,250-->',
      ].join('\n'),
      'utf8'
    );

    await createPreviewFolder();

    const rawTrackedMainPage = fs.readFileSync(mainPagePath, 'utf8');
    const guidMatch = rawTrackedMainPage.match(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/);
    expect(guidMatch).not.toBeNull();
    expect(rawTrackedMainPage).toContain(
      'All agents across all [[child page|Child Page]].\n\n\n<!--SR:!2026-03-10,3,250-->\n\n<!--MEADOW_SR_GUID:'
    );

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const previewHtml = fs.readFileSync(path.join(previewDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}" kind="multiline-basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What does <a href="another%20page.html">Another Page</a> orchestrate?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>All agents across all <a href="child%20page.html">Child Page</a>.</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-10,3,250-->');
  });

  it('should render cloze cards into explicit cloze custom elements', async () => {
    const siteConfigPath = path.join(sitePath, 'conf/site_config.yaml');
    fs.appendFileSync(
      siteConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(sitePath, 'raw', 'tracked_page_content', 'main page.md');
    fs.writeFileSync(
      mainPagePath,
      [
        '# Main Page',
        '',
        '#srs',
        '',
        'Brazilians speak ==Portuguese== and Argentinians speak ==Spanish==.',
        '<!--SR:!2026-03-12,3,250-->',
      ].join('\n'),
      'utf8'
    );

    await createPreviewFolder();

    const rawTrackedMainPage = fs.readFileSync(mainPagePath, 'utf8');
    const guidMatch = rawTrackedMainPage.match(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/);
    expect(guidMatch).not.toBeNull();

    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const previewHtml = fs.readFileSync(path.join(previewDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}:cloze:1" kind="cloze" cloze-type="simplified" sibling-group="${guidMatch![1]}">`);
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}:cloze:2" kind="cloze" cloze-type="simplified" sibling-group="${guidMatch![1]}">`);
    expect(previewHtml).toContain('Brazilians speak <span class="meadow-srs-cloze-blank">...</span> and Argentinians speak Spanish.');
    expect(previewHtml).toContain('Brazilians speak Portuguese and Argentinians speak <span class="meadow-srs-cloze-blank">...</span>.');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

  it('should copy preview to versioned directory without regenerating HTML', async () => {
    // Generate preview first
    await createPreviewFolder();

    // Add a marker file to preview to track if it's copied (not regenerated)
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const markerFile = path.join(previewDir, 'test-marker.txt');
    const markerContent = 'This file proves preview was copied, not regenerated';
    fs.writeFileSync(markerFile, markerContent, 'utf8');

    // Publish to versioned directory
    const siteConfig = loadSiteConfig(sitePath);
    const { version, directory } = publishToVersionedDirectory(sitePath, siteConfig);

    // Verify the marker file exists in the versioned directory
    const versionedMarkerFile = path.join(directory, 'test-marker.txt');
    expect(fs.existsSync(versionedMarkerFile)).toBe(true);
    expect(fs.readFileSync(versionedMarkerFile, 'utf8')).toBe(markerContent);

    // Verify version directory structure
    expect(fs.existsSync(directory)).toBe(true);
    expect(directory).toContain(version);
  });

  it('should preserve exact preview content when creating a new version', async () => {
    // Generate preview
    await createPreviewFolder();

    // Find any HTML file in the preview directory
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const htmlFiles = fs.readdirSync(previewDir).filter(f => f.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);
    
    const testHtmlFile = path.join(previewDir, htmlFiles[0]);
    
    // Read original content
    const originalContent = fs.readFileSync(testHtmlFile, 'utf8');
    
    // Add a unique comment to the preview HTML
    const uniqueSignature = `<!-- PREVIEW_SIGNATURE_${Date.now()} -->`;
    const modifiedContent = originalContent.replace('</body>', `${uniqueSignature}\n</body>`);
    fs.writeFileSync(testHtmlFile, modifiedContent, 'utf8');

    // Create a new version (should copy preview, not regenerate)
    const siteConfig = loadSiteConfig(sitePath);
    const { version, directory } = publishToNewVersion(sitePath, siteConfig);

    // Verify the signature exists in the published version
    const publishedHtmlFile = path.join(directory, htmlFiles[0]);
    expect(fs.existsSync(publishedHtmlFile)).toBe(true);
    
    const publishedContent = fs.readFileSync(publishedHtmlFile, 'utf8');
    expect(publishedContent).toContain(uniqueSignature);
    
    // Verify content is identical (byte-for-byte)
    expect(publishedContent).toBe(modifiedContent);
  });

  it('should not overwrite versioned directory when called multiple times', async () => {
    // Generate preview
    await createPreviewFolder();

    // Publish first version
    const siteConfig = loadSiteConfig(sitePath);
    const { version: version1, directory: dir1 } = publishToVersionedDirectory(sitePath, siteConfig);

    // Add a marker to the published version
    const markerFile1 = path.join(dir1, 'first-publish-marker.txt');
    const timestamp1 = Date.now();
    fs.writeFileSync(markerFile1, `First publish at ${timestamp1}`, 'utf8');

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Modify preview
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const previewMarker = path.join(previewDir, 'preview-modified.txt');
    fs.writeFileSync(previewMarker, 'Preview was modified after first publish', 'utf8');

    // Publish again to same version (should overwrite)
    const { version: version2, directory: dir2 } = publishToVersionedDirectory(sitePath, siteConfig);

    // Verify it's the same version
    expect(version2).toBe(version1);
    expect(dir2).toBe(dir1);

    // The first marker should be gone (directory was replaced)
    expect(fs.existsSync(markerFile1)).toBe(false);

    // The new preview marker should be present
    const newMarkerFile = path.join(dir2, 'preview-modified.txt');
    expect(fs.existsSync(newMarkerFile)).toBe(true);
  });

  it('should create distinct versions when using publishToNewVersion', async () => {
    // Generate preview
    await createPreviewFolder();

    // Publish first version
    const siteConfig1 = loadSiteConfig(sitePath);
    const { version: version1, directory: dir1 } = publishToNewVersion(sitePath, siteConfig1);

    // Add marker to first version
    const marker1 = path.join(dir1, 'version1-marker.txt');
    fs.writeFileSync(marker1, 'Version 1', 'utf8');

    // Modify preview
    const previewDir = SiteConfigPaths.getPreviewDir(sitePath);
    const previewFile = path.join(previewDir, 'version2-content.txt');
    fs.writeFileSync(previewFile, 'New content for version 2', 'utf8');

    // Publish second version
    const siteConfig2 = loadSiteConfig(sitePath);
    const { version: version2, directory: dir2 } = publishToNewVersion(sitePath, siteConfig2);

    // Verify versions are different
    expect(version2).not.toBe(version1);
    expect(dir2).not.toBe(dir1);

    // Verify both versions exist
    expect(fs.existsSync(dir1)).toBe(true);
    expect(fs.existsSync(dir2)).toBe(true);

    // Verify first version still has its marker (not overwritten)
    expect(fs.existsSync(marker1)).toBe(true);
    expect(fs.readFileSync(marker1, 'utf8')).toBe('Version 1');

    // Verify second version has the new content
    const version2File = path.join(dir2, 'version2-content.txt');
    expect(fs.existsSync(version2File)).toBe(true);
  });
});
