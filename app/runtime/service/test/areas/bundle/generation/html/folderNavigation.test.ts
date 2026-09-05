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

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import {
  buildFolderNavigationData,
  renderFolderNavigationDataScript,
} from '../../../../../src/areas/bundle/generation/html/folderNavigation.js';

describe('folder navigation', () => {
  const pages = [
    { directory: 'zeta', normalizedTitle: 'Normalized B', outputPath: 'zeta/Normalized B.html' },
    { directory: 'alpha/deeper', normalizedTitle: 'Normalized Current', outputPath: 'alpha/deeper/Normalized Current.html' },
    { directory: 'alpha', normalizedTitle: 'normalized z', outputPath: 'alpha/normalized z.html' },
    { directory: 'alpha', normalizedTitle: 'Normalized A', outputPath: 'alpha/Normalized A.html' },
    { directory: '', normalizedTitle: 'Root Page', outputPath: 'Root Page.html' },
  ];

  it('builds nested folders and post-normalization filenames alphabetically', () => {
    const data = buildFolderNavigationData(pages);

    expect(data.folders.map(folder => folder.name)).toEqual(['alpha', 'zeta']);
    expect(data.files).toEqual([{ name: 'Root Page.html', path: 'Root Page.html' }]);
    expect(data.folders[0].files).toEqual([
      { name: 'Normalized A.html', path: 'alpha/Normalized A.html' },
      { name: 'normalized z.html', path: 'alpha/normalized z.html' },
    ]);
    expect(data.folders[0].folders[0]).toMatchObject({
      name: 'deeper',
      path: 'alpha/deeper',
      files: [{
        name: 'Normalized Current.html',
        path: 'alpha/deeper/Normalized Current.html',
      }],
    });
  });

  it('serializes the shared tree as executable JavaScript data', () => {
    const script = renderFolderNavigationDataScript(pages);

    expect(script).toMatch(/^window\.MeadowFolderNavData=/);
    expect(script).toContain('"Normalized Current.html"');
    expect(script).toContain('"alpha\/deeper\/Normalized Current.html"');
  });

  it('preserves source folders needed by linked pages in a folder-derived bundle', () => {
    const data = buildFolderNavigationData([
      { directory: 'Vault/Work/Alpha', normalizedTitle: 'Alpha', outputPath: 'index.html', bundleNodeId: 'alpha', bundleNodeKind: 'folder', isEntry: true },
      { directory: 'Vault/Work/Alpha/Nested', normalizedTitle: 'Nested', outputPath: 'Vault/Work/Alpha/Nested/index.html', bundleNodeId: 'nested', parentBundleNodeId: 'alpha', bundleNodeKind: 'folder' },
      { directory: 'Vault/Work/Alpha', normalizedTitle: 'Direct', outputPath: 'Vault/Work/Alpha/Direct.html', bundleNodeId: 'direct', parentBundleNodeId: 'alpha', bundleNodeKind: 'file' },
      { directory: 'Vault/Work/Alpha/Nested', normalizedTitle: 'Nested note', outputPath: 'Vault/Work/Alpha/Nested/Nested note.html', bundleNodeId: 'nested-note', parentBundleNodeId: 'nested', bundleNodeKind: 'file' },
      { directory: 'Vault/Work/Outside', normalizedTitle: 'Outside', outputPath: 'Vault/Work/Outside/Outside.html', bundleNodeId: 'outside', bundleNodeKind: 'file' },
    ]);
    expect(data.folders.map(folder => folder.name)).toEqual(['Alpha', 'Outside']);
    expect(data.folders[0]).toMatchObject({
      path: 'Vault/Work/Alpha',
      files: [{ name: 'Direct.html', path: 'Vault/Work/Alpha/Direct.html' }],
      folders: [{
        name: 'Nested',
        path: 'Vault/Work/Alpha/Nested',
        files: [{ name: 'Nested note.html', path: 'Vault/Work/Alpha/Nested/Nested note.html' }],
      }],
    });
    expect(data.folders[1].files).toEqual([
      { name: 'Outside.html', path: 'Vault/Work/Outside/Outside.html' },
    ]);
    expect(data.files).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('index.html');
  });

  it('omits the complete common ancestor chain from a folder-derived bundle', () => {
    const data = buildFolderNavigationData([
      { directory: 'Vault/Projects/Alpha', normalizedTitle: 'Alpha', outputPath: 'index.html', bundleNodeId: 'alpha', bundleNodeKind: 'folder', isEntry: true },
      { directory: 'Vault/Projects/Alpha', normalizedTitle: 'Alpha note', outputPath: 'Vault/Projects/Alpha/Alpha note.html', bundleNodeId: 'alpha-note', parentBundleNodeId: 'alpha', bundleNodeKind: 'file' },
      { directory: 'Vault/Projects/Alpha/Nested', normalizedTitle: 'Nested note', outputPath: 'Vault/Projects/Alpha/Nested/Nested note.html', bundleNodeId: 'nested-note', bundleNodeKind: 'file' },
    ]);

    expect(data.files).toEqual([
      { name: 'Alpha note.html', path: 'Vault/Projects/Alpha/Alpha note.html' },
    ]);
    expect(data.folders).toEqual([{
      name: 'Nested',
      path: 'Vault/Projects/Alpha/Nested',
      folders: [],
      files: [{
        name: 'Nested note.html',
        path: 'Vault/Projects/Alpha/Nested/Nested note.html',
      }],
    }]);
  });
});


describe('folder navigation startup scrolling', () => {
  const runtime = readFileSync(new URL(
    '../../../../../src/areas/bundle/generation/html/shared/folder-nav.js',
    import.meta.url,
  ), 'utf8');

  it.each([
    { top: 60, bottom: 90, expected: 100 },
    { top: 20, bottom: 50, expected: 70 },
    { top: 240, bottom: 270, expected: 120 },
  ])('reveals the current page only within the sidebar: $top–$bottom', ({ top, bottom, expected }) => {
    const { document } = parseHTML(`<html><body>
      <aside data-meadow-folder-nav>
        <nav class="meadow-folder-nav-scroll"><a aria-current="page">Current</a></nav>
      </aside>
    </body></html>`);
    const navigation = document.querySelector('nav')!;
    const currentPage = document.querySelector('a')!;
    const scrollIntoView = vi.fn();
    currentPage.scrollIntoView = scrollIntoView;
    currentPage.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
    navigation.getBoundingClientRect = () => ({ top: 48 }) as DOMRect;
    Object.defineProperties(navigation, {
      clientTop: { value: 2 },
      clientHeight: { value: 200 },
    });
    navigation.scrollTop = 100;
    const scrollTo = vi.fn();
    runInNewContext(runtime, {
      document,
      URL,
      window: {
        location: { href: 'https://example.test/bundle/Current.html' },
        localStorage: { getItem: () => null },
        innerWidth: 1000,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {},
        requestAnimationFrame: (callback: () => void) => callback(),
        scrollTo,
      },
    });
    expect(navigation.scrollTop).toBe(expected);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
