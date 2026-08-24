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
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../contracts/types/bundleNodeConfig.js';
import { persistFolderBundleAtomically } from '../../../src/areas/bundles/services/folderBundlePersistence.js';

const temporaryDirectories: string[] = [];
const folderId = 'ffffff111111' as BundleNodeId;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-persistence-'));
  temporaryDirectories.push(root);
  const bundleDirectory = path.join(root, 'bundles', 'folder-bundle');
  const stagingDirectory = path.join(root, 'bundles', '.folder-bundle.creating-test');
  const bundleConfig: BundleConfig = {
    bundleGuid: '11111111-1111-4111-8111-111111111111',
    sourceDirectory: path.join(root, 'source'),
    entryBundleNodeId: folderId,
    defaultTraversalBundleNodeId: folderId,
    defaultOutlinksDepth: 1,
    defaultInlinksDepth: 0,
    archivedAt: null,
    bundleCreatedAt: '2026-08-12T00:00:00.000Z',
    bundleUpdatedAt: '2026-08-12T00:00:00.000Z',
    bundleNotes: '',
  };
  const nodes: BundleNodeConfig[] = [{
    bundleNodeName: 'Docs',
    sourceGraphSubdirectory: 'Docs',
    bundleNodeKind: 'folder',
    bundleNodeId: folderId,
    listType: 'whitelist',
  }];
  return { bundleDirectory, stagingDirectory, bundleConfig, nodes };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('atomic folder-bundle persistence', () => {
  it('exposes a complete validated bundle before committing', async () => {
    const input = fixture();
    const commit = vi.fn(async () => {
      expect(fs.existsSync(path.join(input.bundleDirectory, 'config', 'bundle_config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(input.bundleDirectory, 'config', 'bundle_node_config.yaml'))).toBe(true);
    });
    await persistFolderBundleAtomically({ ...input, commit });
    expect(commit).toHaveBeenCalledOnce();
    expect(fs.existsSync(input.bundleDirectory)).toBe(true);
    expect(fs.existsSync(input.stagingDirectory)).toBe(false);
  });

  it('removes both the exposed bundle and staging directory when commit fails', async () => {
    const input = fixture();
    await expect(persistFolderBundleAtomically({
      ...input,
      commit: async () => { throw new Error('simulated commit failure'); },
    })).rejects.toThrow('simulated commit failure');
    expect(fs.existsSync(input.bundleDirectory)).toBe(false);
    expect(fs.existsSync(input.stagingDirectory)).toBe(false);
  });
});
