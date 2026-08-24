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
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { ensureTrackedPageContent } from '../../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

describe('html publish', () => {
  const testSetup = new TestBundleSetup('areas/bundle/generation/fixtures/minimal-bundle', 'minimal-test-bundle');
  let bundlePath: string;

  beforeEach(() => {
    testSetup.setUp();
    bundlePath = testSetup.getBundlePath();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  async function createPreviewFolder() {
    await generateHtmlForBundle(bundlePath, {
      preview: true,
      outputDirectory: getGeneratedBundleTestOutputDirectory(bundlePath),
    });
  }

  it('should keep page HTML stable when sources export is enabled', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(bundleConfigPath, '\ngenerationMarkdownZipEnabled: true\n', 'utf8');

    await createPreviewFolder();

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const htmlFiles = fs.readdirSync(generatedHtmlDir).filter(f => f.endsWith('.html')).sort();
    expect(htmlFiles.length).toBeGreaterThan(0);

    const firstHtmlPath = path.join(generatedHtmlDir, htmlFiles[0]);
    const firstHtml = fs.readFileSync(firstHtmlPath, 'utf8');
    const manifestPath = path.join(generatedHtmlDir, '_mw_assets', 'cust', 'sources-export', 'sources-export-manifest.json');

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(path.join(generatedHtmlDir, '_mw_assets', 'sources-export'))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { downloadFilename: string };
    expect(manifest.downloadFilename).toBe('minimal-test-bundle-sources.zip');
    expect(firstHtml).toContain('data-sources-export-manifest-url="_mw_assets/cust/sources-export/sources-export-manifest.json"');
    expect(firstHtml).toContain('>&#8681; sources</a>');
    expect(firstHtml).not.toMatch(/sources-export-[a-f0-9]{12}\.zip/);

    await createPreviewFolder();

    const secondHtml = fs.readFileSync(firstHtmlPath, 'utf8');
    expect(secondHtml).toBe(firstHtml);
  });

  it('should include spaced repetition assets and page metadata when enabled', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(bundleConfigPath, '\ngenerationSpacedRepetitionEnabled: true\n', 'utf8');

    await createPreviewFolder();

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const htmlFiles = fs.readdirSync(generatedHtmlDir).filter(f => f.endsWith('.html')).sort();
    expect(htmlFiles.length).toBeGreaterThan(0);

    const firstHtml = fs.readFileSync(path.join(generatedHtmlDir, htmlFiles[0]), 'utf8');
    expect(firstHtml).toContain('data-meadow-srs-bundle-guid="x3d9p0k"');
    expect(firstHtml).toContain('data-meadow-srs-page-id=');
    expect(firstHtml).toMatch(/cust\/srs\/srs\.[a-f0-9]{8}\.css/);
    expect(firstHtml).toMatch(/cust\/srs\/srs\.[a-f0-9]{8}\.js/);
    expect(fs.existsSync(path.join(generatedHtmlDir, '_mw_assets', 'srs'))).toBe(false);
  });

  it('should keep OKF artifacts under the customization assets directory', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(bundleConfigPath, '\ngenerationOpenKnowledgeFormatEnabled: true\n', 'utf8');

    await createPreviewFolder();

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const okfDirectory = path.join(generatedHtmlDir, '_mw_assets', 'cust', 'okf');
    expect(fs.existsSync(path.join(okfDirectory, 'okf-download-manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(okfDirectory, 'bundle', 'index.md'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtmlDir, '_mw_assets', 'okf'))).toBe(false);

    const mainPageHtml = fs.readFileSync(path.join(generatedHtmlDir, 'main page.html'), 'utf8');
    expect(mainPageHtml).toContain('_mw_assets/cust/okf/okf-download-manifest.json');
    expect(mainPageHtml).toContain('_mw_assets/cust/okf/bundle/index.md');
  });

  it('should render SRS cards from render source markdown and export original markdown in zip', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(
      bundleConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(bundlePath, 'raw', 'tracked_page_content', 'main page.md');
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

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const previewHtml = fs.readFileSync(path.join(generatedHtmlDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`data-meadow-srs-bundle-guid="x3d9p0k"`);
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}" kind="basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What color is <a href="another%20page.html">another page</a>?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>Blue</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(generatedHtmlDir, '_mw_assets', 'cust', 'sources-export', 'sources-export-manifest.json'), 'utf8')
    ) as { zipFilename: string };
    const zipPath = path.join(generatedHtmlDir, '_mw_assets', 'cust', 'sources-export', manifest.zipFilename);
    const zippedMarkdown = execFileSync('unzip', ['-p', zipPath, 'minimal-test-bundle/main page.md'], {
      encoding: 'utf8',
    });

    // The sources export preserves original source content but strips SR
    // scheduling comments when SRS is enabled (they are Obsidian-local metadata).
    expect(zippedMarkdown).toContain(`<!--MEADOW_SR_GUID:${guidMatch![1]}-->`);
    expect(zippedMarkdown).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

  it('should backfill missing SRS GUIDs into tracked source files before syncing tracked markdown', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(
      bundleConfigPath,
      '\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const sourceDir = path.join(bundlePath, 'source_graphs', 'minimal-bundle-data');
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
    fs.chmodSync(path.join(sourceDir, 'main page.md'), 0o640);
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

    await ensureTrackedPageContent(bundlePath, sourceDir);

    const sourceMainPagePath = path.join(sourceDir, 'main page.md');
    const sourceMainMarkdown = fs.readFileSync(sourceMainPagePath, 'utf8');
    const sourceGuidMatch = sourceMainMarkdown.match(/<!--MEADOW_SR_GUID:([a-f0-9]{13})-->/);
    expect(sourceGuidMatch).not.toBeNull();
    expect(sourceMainMarkdown).toContain(`<!--SR:!2026-03-12,3,250-->\n\n<!--MEADOW_SR_GUID:${sourceGuidMatch![1]}-->`);
    expect(fs.statSync(sourceMainPagePath).mode & 0o777).toBe(0o640);

    const trackedMainPagePath = path.join(bundlePath, 'raw', 'tracked_page_content', 'main page.md');
    const trackedMainMarkdown = fs.readFileSync(trackedMainPagePath, 'utf8');
    expect(trackedMainMarkdown).toContain(`<!--MEADOW_SR_GUID:${sourceGuidMatch![1]}-->`);

    const sourceAnotherMarkdown = fs.readFileSync(path.join(sourceDir, 'another page.md'), 'utf8');
    expect(sourceAnotherMarkdown).not.toContain('<!--MEADOW_SR_GUID:');

    const trackedAnotherMarkdown = fs.readFileSync(
      path.join(bundlePath, 'raw', 'tracked_page_content', 'another page.md'),
      'utf8'
    );
    expect(trackedAnotherMarkdown).not.toContain('<!--MEADOW_SR_GUID:');

    await createPreviewFolder();

    const previewHtml = fs.readFileSync(path.join(getGeneratedBundleTestOutputDirectory(bundlePath), 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${sourceGuidMatch![1]}" kind="basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What color is the sky?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>Blue</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

  it('should render multiline ? cards and add GUIDs before SR comments even when blank lines separate them', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(
      bundleConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(bundlePath, 'raw', 'tracked_page_content', 'main page.md');
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

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const previewHtml = fs.readFileSync(path.join(generatedHtmlDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}" kind="multiline-basic">`);
    expect(previewHtml).toContain('<meadow-srs-prompt>What does <a href="another%20page.html">Another Page</a> orchestrate?</meadow-srs-prompt>');
    expect(previewHtml).toContain('<meadow-srs-answer>All agents across all <a href="child%20page.html">Child Page</a>.</meadow-srs-answer>');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-10,3,250-->');
  });

  it('should render cloze cards into explicit cloze custom elements', async () => {
    const bundleConfigPath = path.join(bundlePath, 'config/bundle_config.yaml');
    fs.appendFileSync(
      bundleConfigPath,
      '\ngenerationMarkdownZipEnabled: true\ngenerationSpacedRepetitionEnabled: true\ngenerationSpacedRepetitionTags:\n  - "#srs"\n',
      'utf8'
    );

    const mainPagePath = path.join(bundlePath, 'raw', 'tracked_page_content', 'main page.md');
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

    const generatedHtmlDir = getGeneratedBundleTestOutputDirectory(bundlePath);
    const previewHtml = fs.readFileSync(path.join(generatedHtmlDir, 'main page.html'), 'utf8');
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}:cloze:1" kind="cloze" cloze-type="simplified" sibling-group="${guidMatch![1]}">`);
    expect(previewHtml).toContain(`<meadow-srs-card guid="${guidMatch![1]}:cloze:2" kind="cloze" cloze-type="simplified" sibling-group="${guidMatch![1]}">`);
    expect(previewHtml).toContain('Brazilians speak <span class="meadow-srs-cloze-blank">...</span> and Argentinians speak Spanish.');
    expect(previewHtml).toContain('Brazilians speak Portuguese and Argentinians speak <span class="meadow-srs-cloze-blank">...</span>.');
    expect(previewHtml).not.toContain('<!--SR:!2026-03-12,3,250-->');
  });

});
