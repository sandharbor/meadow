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
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { ensureTrackedPageContent, prepareGenerationSourceMaterial } from '../../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

describe('tags (obsidian-style) in html preview', () => {
  const testSetup = new TestBundleSetup('areas/bundle/generation/fixtures/tags-bundle', 'tags-test-bundle');
  let bundlePath: string;

  beforeEach(async () => {
    testSetup.setUp();
    bundlePath = testSetup.getBundlePath();

    const sourceGraphDir = path.join(
      process.cwd(),
      '..',
      '..',
      'shared_data',
      'source_graphs',
      'meadow-test-bundles-data'
    );

    await ensureTrackedPageContent(bundlePath, sourceGraphDir);
    await generateHtmlForBundle(bundlePath, {
      preview: true,
      outputDirectory: getGeneratedBundleTestOutputDirectory(bundlePath),
    });
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  it('should generate tag pages and backlinks should show both pages for a shared tag', () => {
    const persistedPageConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundlePath);
    const persistedPageConfigs = parseBundleNodeConfig(fs.readFileSync(persistedPageConfigPath, 'utf8'));
    expect(persistedPageConfigs.some(c => (c.sourceGraphSubdirectory || '') === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR)).toBe(false);

    const preparedPageConfigPath = BundleConfigPaths.getPreparedBundleNodeConfigFile(bundlePath);
    expect(fs.existsSync(preparedPageConfigPath)).toBe(true);
    const preparedPageConfigs = parseBundleNodeConfig(fs.readFileSync(preparedPageConfigPath, 'utf8'));
    expect(preparedPageConfigs.some(c =>
      c.bundleNodeName === 'tag--t018-shared-1' &&
      (c.sourceGraphSubdirectory || '') === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR
    )).toBe(true);
    const firstPreparedConfig = fs.readFileSync(preparedPageConfigPath, 'utf8');
    const repeatedPreparation = prepareGenerationSourceMaterial(bundlePath, { tagsEnabled: true });
    expect(repeatedPreparation.bundleNodeConfigPath).toBe(preparedPageConfigPath);
    expect(fs.readFileSync(preparedPageConfigPath, 'utf8')).toBe(firstPreparedConfig);

    const rawTagPageMdPath = path.join(BundleConfigPaths.getTrackedPageContentDir(bundlePath), BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR, 'tag--t018-shared-1.md');
    expect(fs.existsSync(rawTagPageMdPath)).toBe(false);

    const tagPageMdPath = path.join(BundleConfigPaths.getPreparedSourceContentDir(bundlePath), BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR, 'tag--t018-shared-1.md');
    expect(fs.existsSync(tagPageMdPath)).toBe(true);

    const tagHtmlPath = path.join(
      getGeneratedBundleTestOutputDirectory(bundlePath),
      '_mw_gen',
      'tagpages',
      'tag--t018-shared-1.html',
    );
    expect(fs.existsSync(tagHtmlPath)).toBe(true);

    const html = fs.readFileSync(tagHtmlPath, 'utf8');

    // Backlinks section should include both pages.
    expect(html).toContain('<h2>Backlinks</h2>');
    expect(html).toContain('t018 ---- shared tags page 1');
    expect(html).toContain('t018 ---- shared tags page 2');
  });

  it('should not rewrite tag-like text inside fenced code blocks or inline code ticks', () => {
    const rawCodePageMdPath = path.join(
      BundleConfigPaths.getTrackedPageContentSubdir(bundlePath, 't018'),
      't018 ---- code blocks and inline code should not create tag links.md'
    );
    expect(fs.existsSync(rawCodePageMdPath)).toBe(true);
    const rawMd = fs.readFileSync(rawCodePageMdPath, 'utf8');
    expect(rawMd).not.toContain('[[tag--');

    const codePageMdPath = path.join(
      BundleConfigPaths.getPreparedSourceContentDir(bundlePath),
      't018',
      't018 ---- code blocks and inline code should not create tag links.md'
    );
    expect(fs.existsSync(codePageMdPath)).toBe(true);

    const md = fs.readFileSync(codePageMdPath, 'utf8');

    // These should remain literal and must NOT become [[tag--...|#...]] links.
    expect(md).toContain('`#tag-inside-code-ticks`');
    expect(md).toContain('#tag-inside-fenced-code-block');
    expect(md).not.toContain('[[tag--tag-inside-code-ticks|#tag-inside-code-ticks]]');
    expect(md).not.toContain('[[tag--tag-inside-fenced-code-block|#tag-inside-fenced-code-block]]');

    // And we should not create tag pages from those code snippets.
    const tagPagesDir = path.join(BundleConfigPaths.getPreparedSourceContentDir(bundlePath), BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR);
    const tagPageFiles = fs.existsSync(tagPagesDir) ? fs.readdirSync(tagPagesDir).join('\n') : '';
    expect(tagPageFiles).not.toContain('tag--tag-inside-code-ticks.md');
    expect(tagPageFiles).not.toContain('tag--tag-inside-fenced-code-block.md');
  });
});
