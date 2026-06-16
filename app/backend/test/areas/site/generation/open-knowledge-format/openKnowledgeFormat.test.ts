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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import {
  prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory
} from '../../../../../src/areas/site/generation/open-knowledge-format/openKnowledgeFormat.js';

function pageConfig(title: string, dir = ''): SitePageConfig {
  return {
    title,
    source_graph_subdirectory: dir,
    file_type: 'md',
    config: { list_type: 'whitelist' },
  };
}

function writeFile(root: string, relativePath: string, content: string | Buffer): void {
  const filePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function readFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
}

describe('prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory', () => {
  let tempDir: string;
  let scrubbedDir: string;
  let okfDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-test-'));
    scrubbedDir = path.join(tempDir, 'scrubbed');
    okfDir = path.join(tempDir, 'okf');
    fs.mkdirSync(scrubbedDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes concepts with merged frontmatter and bundle-root markdown links', () => {
    writeFile(scrubbedDir, 'main page.md', [
      '---',
      'description: A useful page',
      '---',
      'See [[connected page]] and ![[image file.png]].',
      '',
    ].join('\n'));
    writeFile(scrubbedDir, 'connected page.md', 'Connected body\n');
    writeFile(scrubbedDir, 'image file.png', Buffer.from([1, 2, 3]));

    prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(scrubbedDir, okfDir, {
      sitePageConfigs: [pageConfig('main page'), pageConfig('connected page')],
      initialPageTitle: 'main page',
      initialPageDirectory: '',
      allLinkResolutionMaps: new Map([
        [
          '/main page.md',
          {
            'connected page': {
              link_resolved_target_directory: '',
              link_resolved_target_path: 'connected page.md',
            },
            'image file.png': {
              link_resolved_target_directory: '',
              link_resolved_target_path: 'image file.png',
            },
          },
        ],
      ]),
    });

    const mainPage = readFile(okfDir, 'main page.md');
    expect(mainPage).toContain('description: A useful page');
    expect(mainPage).toContain('title: main page');
    expect(mainPage).toContain('type: Knowledge Page');
    expect(mainPage).toContain('[connected page](/connected%20page.md)');
    expect(mainPage).toContain('![image file.png](/image%20file.png)');
    expect(readFile(okfDir, 'index.md')).toContain('[main page](/main%20page.md)');
    expect(fs.readFileSync(path.join(okfDir, 'image file.png'))).toEqual(Buffer.from([1, 2, 3]));
  });

  it('uses the log beside the initial page and renames other reserved files without collisions', () => {
    writeFile(scrubbedDir, 'sub/home.md', 'Home\n');
    writeFile(scrubbedDir, 'sub/log.md', 'Preferred log\n');
    writeFile(scrubbedDir, 'log.md', 'Root log\n');
    writeFile(scrubbedDir, 'log-original.md', 'Existing root page\n');
    writeFile(scrubbedDir, 'alpha/log.md', 'Alpha log\n');
    writeFile(scrubbedDir, 'index.md', 'Reserved index\n');

    const result = prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(scrubbedDir, okfDir, {
      sitePageConfigs: [
        pageConfig('home', 'sub'),
        pageConfig('log', 'sub'),
        pageConfig('log'),
        pageConfig('log-original'),
        pageConfig('log', 'alpha'),
        pageConfig('index'),
      ],
      initialPageTitle: 'home',
      initialPageDirectory: 'sub',
    });

    expect(readFile(okfDir, 'log.md')).toBe('Preferred log\n');
    expect(readFile(okfDir, 'log-original.md')).toContain('Existing root page');
    expect(readFile(okfDir, 'log-original-2.md')).toContain('Root log');
    expect(readFile(okfDir, 'alpha/log-original.md')).toContain('Alpha log');
    expect(readFile(okfDir, 'index-original.md')).toContain('Reserved index');
    expect(fs.existsSync(path.join(okfDir, 'sub', 'log.md'))).toBe(false);
    expect(result.renames).toEqual([
      {
        sourcePath: 'alpha/log.md',
        originalOutputPath: 'alpha/log-original.md',
        finalOutputPath: 'alpha/log-original.md',
        reason: 'reserved-filename',
      },
      {
        sourcePath: 'index.md',
        originalOutputPath: 'index-original.md',
        finalOutputPath: 'index-original.md',
        reason: 'reserved-filename',
      },
      {
        sourcePath: 'log.md',
        originalOutputPath: 'log-original.md',
        finalOutputPath: 'log-original-2.md',
        reason: 'reserved-filename',
      },
    ]);
  });

  it('can map an arbitrary tracked page to root log.md', () => {
    writeFile(scrubbedDir, 'home.md', 'Home\n');
    writeFile(scrubbedDir, 'updates.md', 'Updates\n');

    prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(scrubbedDir, okfDir, {
      sitePageConfigs: [pageConfig('home'), pageConfig('updates')],
      initialPageTitle: 'home',
      initialPageDirectory: '',
      logSource: { mode: 'trackedPage', sourceGraphPath: 'updates.md' },
    });

    expect(readFile(okfDir, 'log.md')).toBe('Updates\n');
    expect(fs.existsSync(path.join(okfDir, 'updates.md'))).toBe(false);
  });

  it('omits log.md when the log source mode is none', () => {
    writeFile(scrubbedDir, 'home.md', 'Home\n');
    writeFile(scrubbedDir, 'log.md', 'Log\n');

    prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(scrubbedDir, okfDir, {
      sitePageConfigs: [pageConfig('home'), pageConfig('log')],
      initialPageTitle: 'home',
      initialPageDirectory: '',
      logSource: { mode: 'none' },
    });

    expect(fs.existsSync(path.join(okfDir, 'log.md'))).toBe(false);
    expect(readFile(okfDir, 'log-original.md')).toContain('Log');
  });
});
