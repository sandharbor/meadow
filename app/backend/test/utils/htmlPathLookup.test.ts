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
import os from 'os';
import path from 'path';
import { getHtmlPathForPage } from '../../src/utils/htmlPathLookup.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';

describe('getHtmlPathForPage', () => {
  let siteDirectory: string;

  beforeEach(() => {
    siteDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-html-path-'));
    fs.mkdirSync(SiteConfigPaths.getConfDir(siteDirectory), { recursive: true });
    fs.writeFileSync(SiteConfigPaths.getSiteConfigFile(siteDirectory), '{}\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(siteDirectory, { recursive: true, force: true });
  });

  it('finds a non-markdown tracked page', () => {
    fs.writeFileSync(
      SiteConfigPaths.getSitePageConfigFile(siteDirectory),
      [
        'pages:',
        '  - fileType: excalidraw',
        '    listType: whitelist',
        '    sourceGraphSubdirectory: t006',
        '    title: t006 --- meadow-flower',
      ].join('\n'),
      'utf8',
    );

    expect(getHtmlPathForPage(siteDirectory, 't006 --- meadow-flower', 't006')).toBe(
      't006/t006 --- meadow-flower.html',
    );
  });

  it('prefers markdown when multiple tracked pages share a title', () => {
    fs.writeFileSync(
      SiteConfigPaths.getSitePageConfigFile(siteDirectory),
      [
        'pages:',
        '  - fileType: excalidraw',
        '    listType: whitelist',
        '    sourceGraphSubdirectory: t006',
        '    title: shared title',
        '  - fileType: md',
        '    listType: whitelist',
        '    sourceGraphSubdirectory: t006',
        '    title: shared title',
      ].join('\n'),
      'utf8',
    );

    expect(getHtmlPathForPage(siteDirectory, 'shared title', 't006')).toBe(
      't006/shared title.html',
    );
  });
});
