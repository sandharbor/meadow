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

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderPageToHtml } from '../../src/html/htmlGenerator.js';
import type { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';

function mkTmp(): { contentRoot: string; outputRoot: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-directive-'));
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

function writeMd(root: string, title: string, content: string): void {
  fs.writeFileSync(path.join(root, `${title}.md`), content, 'utf8');
}

const siteConfig: SiteConfig = {
  initialSitePageTitle: 'host',
  initialSitePageDirectory: '',
} as unknown as SiteConfig;

const sitePageConfigs: SitePageConfig[] = [
  { title: 'host', config: { list_type: 'whitelist' } },
  { title: 'drawing', file_type: 'excalidraw', config: { list_type: 'whitelist' } },
  { title: 'target', config: { list_type: 'whitelist' } },
];

function renderHost(contentRoot: string, outputRoot: string, markdown: string): string {
  writeMd(contentRoot, 'host', markdown);
  writeMd(contentRoot, 'drawing.excalidraw', 'drawing source');
  writeMd(contentRoot, 'target', 'target page');

  const result = renderPageToHtml(
    contentRoot,
    { host: { isUninterestingLeafPage: () => false } },
    'host',
    'host',
    outputRoot,
    {},
    siteConfig,
    'host.md',
    sitePageConfigs,
    { processBacklinks: false },
    undefined,
    '',
    contentRoot,
    outputRoot,
    undefined,
    new Map([
      [
        '/drawing.excalidraw',
        {
          target: {
            link_resolved_target_directory: '',
            link_resolved_target_path: 'target.md',
          },
        },
      ],
    ])
  );

  expect(result.htmlContent).not.toBeNull();
  return result.htmlContent!;
}

describe('meadow container directive', () => {
  it('customizes an Excalidraw embed without rendering the directive text', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      const html = renderHost(contentRoot, outputRoot, [
        ':::meadow',
        '![[drawing.excalidraw|300]]',
        '',
        'enableEmbeddedLinks: true',
        'enableFullscreenButton: true',
        'enableOpenDedicatedPage: false',
        ':::',
      ].join('\n'));

      expect(html).not.toContain(':::meadow');
      expect(html).not.toContain('enableEmbeddedLinks');
      expect(html).toContain('class="meadow-excalidraw-embed-frame"');
      expect(html).toContain('style="max-width: 300px"');
      expect(html).toContain('data-meadow-excalidraw-fullscreen="true"');
      expect(html).toContain('data-meadow-excalidraw-links=');
      expect(html).toContain('target.html');
      expect(html).not.toContain('meadow-excalidraw-embed-link');
      expect(html).not.toContain('meadow-excalidraw-open-icon');
    } finally {
      cleanup();
    }
  });

  it('keeps default Excalidraw embeds as dedicated-page links', () => {
    const { contentRoot, outputRoot, cleanup } = mkTmp();
    try {
      const html = renderHost(contentRoot, outputRoot, '![[drawing.excalidraw|300]]');

      expect(html).toContain('class="meadow-excalidraw-embed-link"');
      expect(html).toContain('href="drawing.html"');
      expect(html).toContain('style="max-width: 300px"');
      expect(html).not.toContain('data-meadow-excalidraw-links=');
      expect(html).not.toContain('data-meadow-excalidraw-fullscreen');
    } finally {
      cleanup();
    }
  });
});
