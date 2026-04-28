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
import { ensureTrackedPageContent } from '../../src/utils/trackedPageContentUtils.js';
import { TestSiteSetup } from './testSetup.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';

describe('tags (obsidian-style) in html preview', () => {
  const testSetup = new TestSiteSetup('tags-site', 'tags-test-site');
  let sitePath: string;

  beforeEach(async () => {
    testSetup.setUp();
    sitePath = testSetup.getSitePath();

    const sourceGraphDir = path.join(
      process.cwd(),
      '..',
      'shared_data',
      'source_graphs',
      'meadow-test-sites-data'
    );

    await ensureTrackedPageContent(sitePath, sourceGraphDir);
    await generateHtmlForSite(sitePath, { preview: true });
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  it('should generate tag pages and backlinks should show both pages for a shared tag', () => {
    const tagPageMdPath = path.join(SiteConfigPaths.getTrackedPageContentDir(sitePath), SiteConfigPaths.TAGPAGES_DIR, 'tag--t018-shared-1.md');
    expect(fs.existsSync(tagPageMdPath)).toBe(true);

    const tagHtmlPath = path.join(SiteConfigPaths.getPreviewDir(sitePath), SiteConfigPaths.TAGPAGES_DIR, 'tag--t018-shared-1.html');
    expect(fs.existsSync(tagHtmlPath)).toBe(true);

    const html = fs.readFileSync(tagHtmlPath, 'utf8');

    // Backlinks section should include both pages.
    expect(html).toContain('<h2>Backlinks</h2>');
    expect(html).toContain('t018 ---- shared tags page 1');
    expect(html).toContain('t018 ---- shared tags page 2');
  });

  it('should not rewrite tag-like text inside fenced code blocks or inline code ticks', () => {
    const codePageMdPath = path.join(
      SiteConfigPaths.getTrackedPageContentSubdir(sitePath, 't018'),
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
    const tagPagesDir = path.join(SiteConfigPaths.getTrackedPageContentDir(sitePath), SiteConfigPaths.TAGPAGES_DIR);
    const tagPageFiles = fs.existsSync(tagPagesDir) ? fs.readdirSync(tagPagesDir).join('\n') : '';
    expect(tagPageFiles).not.toContain('tag--tag-inside-code-ticks.md');
    expect(tagPageFiles).not.toContain('tag--tag-inside-fenced-code-block.md');
  });
});


