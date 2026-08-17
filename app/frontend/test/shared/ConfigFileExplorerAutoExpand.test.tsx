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
import {
  collectDirectoryPaths,
  findAutoSelectedChangedFile,
  type FileNode,
} from '../../../shared_components/ConfigFileExplorer/ConfigFileExplorer';

const folder = (name: string, path: string, children: FileNode[]): FileNode => ({
  name,
  path,
  type: 'directory',
  gitStatus: 'has-changes',
  children,
});

const file = (name: string, path: string): FileNode => ({
  name,
  path,
  type: 'file',
  gitStatus: 'new',
});

describe('ConfigFileExplorer selective automatic expansion', () => {
  it('filters only the initial expansion set and leaves expand-all unfiltered', () => {
    const assetsPath = '/preview/_mw_assets';
    const indexPath = `${assetsPath}/search/index`;
    const tree = [
      folder('_mw_assets', assetsPath, [
        folder('search', `${assetsPath}/search`, [
          folder('index', indexPath, [file('shard-00.js', `${indexPath}/shard-00.js`)]),
          file('search.js', `${assetsPath}/search/search.js`),
        ]),
      ]),
      folder('pages', '/preview/pages', [file('welcome.html', '/preview/pages/welcome.html')]),
    ];

    expect(collectDirectoryPaths(
      tree,
      (node) => node.path !== assetsPath && node.path !== indexPath,
    )).toEqual([
      `${assetsPath}/search`,
      '/preview/pages',
    ]);

    expect(collectDirectoryPaths(tree)).toEqual([
      assetsPath,
      `${assetsPath}/search`,
      indexPath,
      '/preview/pages',
    ]);
  });

  it('prefers a changed file accepted by the selection preference', () => {
    const internalPath = '/preview/_mw_assets/search.js';
    const pagePath = '/preview/pages/welcome.html';
    const tree = [
      folder('_mw_assets', '/preview/_mw_assets', [file('search.js', internalPath)]),
      folder('pages', '/preview/pages', [file('welcome.html', pagePath)]),
    ];

    expect(findAutoSelectedChangedFile(
      tree,
      (node) => !node.path.includes('/_mw_assets/'),
    )).toBe(pagePath);
  });

  it('falls back to the first changed file when none match the selection preference', () => {
    const internalPath = '/preview/_mw_gen/metadata.json';
    const tree = [
      folder('_mw_gen', '/preview/_mw_gen', [file('metadata.json', internalPath)]),
    ];

    expect(findAutoSelectedChangedFile(tree, () => false)).toBe(internalPath);
  });
});
