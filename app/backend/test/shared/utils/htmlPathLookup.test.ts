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
import { getHtmlPathForPage } from '../../../src/shared/utils/htmlPathLookup.js';
import { SiteConfigPaths } from '../../../../shared_code/paths/siteConfigPaths.js';
import { stringifySiteNodeConfig } from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import { makeSiteNodeConfig } from '../support/siteNodeConfigTestUtils.js';

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
      SiteConfigPaths.getSiteNodeConfigFile(siteDirectory),
      stringifySiteNodeConfig([
        makeSiteNodeConfig('t006 --- meadow-flower', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'excalidraw',
        }),
      ]),
      'utf8',
    );

    expect(getHtmlPathForPage(siteDirectory, 't006 --- meadow-flower', 't006')).toBe(
      't006/t006 --- meadow-flower.html',
    );
  });

  it('prefers markdown when multiple tracked pages share a title', () => {
    fs.writeFileSync(
      SiteConfigPaths.getSiteNodeConfigFile(siteDirectory),
      stringifySiteNodeConfig([
        makeSiteNodeConfig('shared title', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'excalidraw',
        }),
        makeSiteNodeConfig('shared title', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'md',
        }),
      ]),
      'utf8',
    );

    expect(getHtmlPathForPage(siteDirectory, 'shared title', 't006')).toBe(
      't006/shared title.html',
    );
  });

  it('uses the central route plan for folder defaults and collisions', () => {
    const folderId = 'f1b2c3d4e5f6';
    const fileId = 'p1b2c3d4e5f6';
    fs.writeFileSync(
      SiteConfigPaths.getSiteConfigFile(siteDirectory),
      `entrySiteNodeId: ${folderId}\ndefaultTraversalSiteNodeId: ${folderId}\n`,
      'utf8',
    );
    fs.writeFileSync(
      SiteConfigPaths.getSiteNodeConfigFile(siteDirectory),
      stringifySiteNodeConfig([{
        siteNodeName: 'Project', sourceGraphSubdirectory: 'Project', siteNodeKind: 'folder',
        siteNodeId: folderId as never, listType: 'whitelist',
      }, {
        siteNodeName: 'index', sourceGraphSubdirectory: 'Project', siteNodeKind: 'file', fileType: 'md',
        siteNodeId: fileId as never, listType: 'whitelist',
      }]),
      'utf8',
    );
    expect(getHtmlPathForPage(siteDirectory, 'Project', 'Project')).toBe('index.html');
    expect(getHtmlPathForPage(siteDirectory, 'index', 'Project')).toBe('Project/index.html');
  });
});
