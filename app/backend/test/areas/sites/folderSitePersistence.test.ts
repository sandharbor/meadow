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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SiteConfig } from '../../../../shared_code/types/siteConfig.js';
import type { SiteNodeConfig, SiteNodeId } from '../../../../shared_code/types/siteNodeConfig.js';
import { persistFolderSiteAtomically } from '../../../src/areas/sites/services/folderSitePersistence.js';

const temporaryDirectories: string[] = [];
const folderId = 'ffffff111111' as SiteNodeId;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-persistence-'));
  temporaryDirectories.push(root);
  const siteDirectory = path.join(root, 'sites', 'folder-site');
  const stagingDirectory = path.join(root, 'sites', '.folder-site.creating-test');
  const siteConfig: SiteConfig = {
    siteGuid: '11111111-1111-4111-8111-111111111111',
    sourceDirectory: path.join(root, 'source'),
    entrySiteNodeId: folderId,
    defaultTraversalSiteNodeId: folderId,
    defaultOutlinksDepth: 1,
    defaultInlinksDepth: 0,
    generatedSiteVersions: [],
    archivedAt: null,
    siteCreatedAt: '2026-08-12T00:00:00.000Z',
    siteUpdatedAt: '2026-08-12T00:00:00.000Z',
    siteLastPublishedAt: null,
    siteNotes: '',
  };
  const nodes: SiteNodeConfig[] = [{
    siteNodeName: 'Docs',
    sourceGraphSubdirectory: 'Docs',
    siteNodeKind: 'folder',
    siteNodeId: folderId,
    listType: 'whitelist',
  }];
  return { siteDirectory, stagingDirectory, siteConfig, nodes };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('atomic folder-site persistence', () => {
  it('exposes a complete validated site before committing', async () => {
    const input = fixture();
    const commit = vi.fn(async () => {
      expect(fs.existsSync(path.join(input.siteDirectory, 'conf', 'site_config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(input.siteDirectory, 'conf', 'site_node_config.yaml'))).toBe(true);
    });
    await persistFolderSiteAtomically({ ...input, commit });
    expect(commit).toHaveBeenCalledOnce();
    expect(fs.existsSync(input.siteDirectory)).toBe(true);
    expect(fs.existsSync(input.stagingDirectory)).toBe(false);
  });

  it('removes both the exposed site and staging directory when commit fails', async () => {
    const input = fixture();
    await expect(persistFolderSiteAtomically({
      ...input,
      commit: async () => { throw new Error('simulated commit failure'); },
    })).rejects.toThrow('simulated commit failure');
    expect(fs.existsSync(input.siteDirectory)).toBe(false);
    expect(fs.existsSync(input.stagingDirectory)).toBe(false);
  });
});
