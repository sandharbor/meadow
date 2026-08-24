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
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { stringifyBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { makeBundleNodeConfig } from '../support/bundleNodeConfigTestUtils.js';

describe('getHtmlPathForPage', () => {
  let bundleDirectory: string;

  beforeEach(() => {
    bundleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-html-path-'));
    fs.mkdirSync(BundleConfigPaths.getConfigDir(bundleDirectory), { recursive: true });
    fs.writeFileSync(BundleConfigPaths.getBundleConfigFile(bundleDirectory), '{}\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(bundleDirectory, { recursive: true, force: true });
  });

  it('finds a non-markdown tracked page', () => {
    fs.writeFileSync(
      BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory),
      stringifyBundleNodeConfig([
        makeBundleNodeConfig('t006 --- meadow-flower', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'excalidraw',
        }),
      ]),
      'utf8',
    );

    expect(getHtmlPathForPage(bundleDirectory, 't006 --- meadow-flower', 't006')).toBe(
      't006/t006 --- meadow-flower.html',
    );
  });

  it('prefers markdown when multiple tracked pages share a title', () => {
    fs.writeFileSync(
      BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory),
      stringifyBundleNodeConfig([
        makeBundleNodeConfig('shared title', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'excalidraw',
        }),
        makeBundleNodeConfig('shared title', 'whitelist', {
          sourceGraphSubdirectory: 't006',
          fileType: 'md',
        }),
      ]),
      'utf8',
    );

    expect(getHtmlPathForPage(bundleDirectory, 'shared title', 't006')).toBe(
      't006/shared title.html',
    );
  });

  it('uses the central route plan for folder defaults and collisions', () => {
    const folderId = 'f1b2c3d4e5f6';
    const fileId = 'p1b2c3d4e5f6';
    fs.writeFileSync(
      BundleConfigPaths.getBundleConfigFile(bundleDirectory),
      `entryBundleNodeId: ${folderId}\ndefaultTraversalBundleNodeId: ${folderId}\n`,
      'utf8',
    );
    fs.writeFileSync(
      BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory),
      stringifyBundleNodeConfig([{
        bundleNodeName: 'Project', sourceGraphSubdirectory: 'Project', bundleNodeKind: 'folder',
        bundleNodeId: folderId as never, listType: 'whitelist',
      }, {
        bundleNodeName: 'index', sourceGraphSubdirectory: 'Project', bundleNodeKind: 'file', fileType: 'md',
        bundleNodeId: fileId as never, listType: 'whitelist',
      }]),
      'utf8',
    );
    expect(getHtmlPathForPage(bundleDirectory, 'Project', 'Project')).toBe('index.html');
    expect(getHtmlPathForPage(bundleDirectory, 'index', 'Project')).toBe('Project/index.html');
  });
});
