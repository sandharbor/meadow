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

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import type { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import { renderTransclusionToHtml } from '../../../../../src/areas/site/generation/html/transclusion.js';
import { makeSiteNodeConfig } from '../../../../shared/support/siteNodeConfigTestUtils.js';

function writeMd(root: string, subdir: string, title: string, content: string): void {
  const dir = subdir ? path.join(root, subdir) : root;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${title}.md`), content, 'utf8');
}

function mkTmp(): { contentRoot: string; outputRoot: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-transclusion-'));
  const contentRoot = path.join(base, 'tracked_page_content');
  const outputRoot = path.join(base, 'preview');
  fs.mkdirSync(contentRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  return {
    contentRoot,
    outputRoot,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

const siteConfig: SiteConfig = {};

describe('html transclusion', () => {
  it('full page transclusion should embed entire page content', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 't017', 't017 ---- full page source', [
        '### Full Page Source Content',
        '',
        'This is the content that should be transcluded into another page.',
      ].join('\n'));

      const siteNodeConfigs: SiteNodeConfig[] = [
        makeSiteNodeConfig('t017 ---- full page source', 'whitelist', { sourceGraphSubdirectory: 't017' }),
      ];

      const html = renderTransclusionToHtml('t017 ---- full page source', {
        finalPageDirectory: 't017',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        siteSlug: undefined,
        linkResolutionMapForCaller: {
          't017 ---- full page source': {
            link_resolved_target_directory: 't017',
            link_resolved_target_path: 't017/t017 ---- full page source.md',
          },
        },
        allLinkResolutionMaps: new Map(),
      });

      expect(html).toContain('class="transcluded"');
      expect(html).toContain('Full Page Source Content');
      expect(html).toContain('should be transcluded');
      // Top-level see-in-context exists
      expect(html).toContain('class="transcluded-see-in-context"');
    } finally {
      cleanup();
    }
  });

  it('section transclusion should embed only the requested section', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 't017', 't017 ---- section source', [
        '### Introduction',
        '',
        'This is the introduction section. It should not be transcluded.',
        '',
        '### Details',
        '',
        'This is the Details section. This section should be transcluded.',
        '',
        '### Conclusion',
        '',
        'This is the conclusion section. It should also not be transcluded.',
      ].join('\n'));

      const siteNodeConfigs: SiteNodeConfig[] = [
        makeSiteNodeConfig('t017 ---- section source', 'whitelist', { sourceGraphSubdirectory: 't017' }),
      ];

      const html = renderTransclusionToHtml('t017 ---- section source#Details', {
        finalPageDirectory: 't017',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        linkResolutionMapForCaller: {
          't017 ---- section source#Details': {
            link_resolved_target_directory: 't017',
            link_resolved_target_path: 't017/t017 ---- section source.md',
          },
        },
        allLinkResolutionMaps: new Map(),
      });

      expect(html).toContain('Details');
      expect(html).toContain('This is the Details section');
      expect(html).not.toContain('introduction section');
      expect(html).not.toContain('conclusion section');
    } finally {
      cleanup();
    }
  });

  it('block transclusion should embed only the block containing the requested ^id', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 't017', 't017 ---- block source', [
        '### Block Source Content',
        '',
        'This document contains multiple blocks with identifiers.',
        '',
        'This is a key insight that should be transcluded. ^key-insight',
        '',
        'This block has a specific identifier for testing. ^f4c4d5',
      ].join('\n'));

      const siteNodeConfigs: SiteNodeConfig[] = [
        makeSiteNodeConfig('t017 ---- block source', 'whitelist', { sourceGraphSubdirectory: 't017' }),
      ];

      const html = renderTransclusionToHtml('t017 ---- block source#^key-insight', {
        finalPageDirectory: 't017',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        linkResolutionMapForCaller: {
          't017 ---- block source#^key-insight': {
            link_resolved_target_directory: 't017',
            link_resolved_target_path: 't017/t017 ---- block source.md',
          },
        },
        allLinkResolutionMaps: new Map(),
      });

      expect(html).toContain('key insight');
      expect(html).toContain('^key-insight');
      expect(html).not.toContain('^f4c4d5');
    } finally {
      cleanup();
    }
  });

  it('nested transclusion should only show one see-in-context button (top-level only)', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 't017', 'outer', [
        '### Outer',
        '',
        'Before nested:',
        '',
        '![[inner]]',
        '',
        'After nested.',
      ].join('\n'));

      writeMd(contentRoot, 't017', 'inner', [
        '### Inner',
        '',
        'This is inner content.',
      ].join('\n'));

      const siteNodeConfigs: SiteNodeConfig[] = [
        makeSiteNodeConfig('outer', 'whitelist', { sourceGraphSubdirectory: 't017' }),
        makeSiteNodeConfig('inner', 'whitelist', { sourceGraphSubdirectory: 't017' }),
      ];

      const allMaps = new Map<string, Record<string, any>>();
      allMaps.set('t017/outer.md', {
        inner: { link_resolved_target_directory: 't017', link_resolved_target_path: 't017/inner.md' },
      });

      const html = renderTransclusionToHtml('outer', {
        finalPageDirectory: 't017',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        linkResolutionMapForCaller: {
          outer: { link_resolved_target_directory: 't017', link_resolved_target_path: 't017/outer.md' },
        },
        allLinkResolutionMaps: allMaps as unknown as Map<string, any>,
      });

      const count = (html.match(/class="transcluded-see-in-context"/g) || []).length;
      expect(count).toBe(1);
      expect(html).toContain('This is inner content');
    } finally {
      cleanup();
    }
  });

  it('non-whitelisted transclusion should return the standard not-whitelisted message', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 't017', 'secret', 'Top secret');

      const siteNodeConfigs: SiteNodeConfig[] = [
        // secret not present => not whitelisted
      ];

      const html = renderTransclusionToHtml('secret', {
        finalPageDirectory: '',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        linkResolutionMapForCaller: {
          secret: { link_resolved_target_directory: 't017', link_resolved_target_path: 't017/secret.md' },
        },
        allLinkResolutionMaps: new Map(),
      });

      expect(html).toBe('<span class="link-not-tracked">link not tracked</span>');
    } finally {
      cleanup();
    }
  });

  it('link resolution inside transcluded content should use the transcluded page map but compute URLs relative to the final page', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      writeMd(contentRoot, 'a', 'source', [
        '### Source',
        '',
        'Links to [[dest]]',
      ].join('\n'));
      writeMd(contentRoot, 'b', 'dest', '### Dest');

      const siteNodeConfigs: SiteNodeConfig[] = [
        makeSiteNodeConfig('source', 'whitelist', { sourceGraphSubdirectory: 'a' }),
        makeSiteNodeConfig('dest', 'whitelist', { sourceGraphSubdirectory: 'b' }),
      ];

      const allMaps = new Map<string, Record<string, any>>();
      allMaps.set('a/source.md', {
        dest: { link_resolved_target_directory: 'b', link_resolved_target_path: 'b/dest.md' },
      });

      // Final page is in directory "c" in output tree, so link to b/dest.html should be ../b/dest.html
      const html = renderTransclusionToHtml('source', {
        finalPageDirectory: 'c',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        siteNodeConfigs,
        siteConfig,
        linkResolutionMapForCaller: {
          source: { link_resolved_target_directory: 'a', link_resolved_target_path: 'a/source.md' },
        },
        allLinkResolutionMaps: allMaps as unknown as Map<string, any>,
      });

      expect(html).toContain('href="../b/dest.html"');
    } finally {
      cleanup();
    }
  });
});

