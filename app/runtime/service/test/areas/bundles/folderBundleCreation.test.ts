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
import { afterEach, describe, expect, it } from 'vitest';
import { parseBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  FOLDER_BUNDLE_MAX_RAW_NODES,
  preflightFolderBundle,
  verifyFolderBundlePreflight,
} from '../../../src/areas/bundles/services/folderBundleCreation.js';

const temporaryDirectories: string[] = [];

function sourceFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-bundle-test-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'Projects', 'Sub'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Empty'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Projects', 'A.md'), '# A', 'utf8');
  fs.writeFileSync(path.join(root, 'Projects', 'Sub', 'B.md'), '# B', 'utf8');
  fs.writeFileSync(path.join(root, 'Empty', 'ignored.txt'), 'unsupported', 'utf8');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function graphResult(overrides: Partial<{
  supportedSeedFileCount: number;
  requiredRawFolderNodeCount: number;
  predictedRawNodeCount: number;
  predictedTypedEdgeCount: number;
}> = {}) {
  return JSON.stringify({
    nodes: [{ bundleNodeKind: 'folder' }, { bundleNodeKind: 'file', is_sensitive: true }],
    edges: [],
    folderScope: {
      normalizedSelectedFolders: ['Projects', 'Empty'],
      supportedSeedFileCount: overrides.supportedSeedFileCount ?? 2,
      requiredRawFolderNodeCount: overrides.requiredRawFolderNodeCount ?? 3,
      skippedCounts: { unsupportedFile: 1 },
      skippedPaths: [{ path: 'Empty/ignored.txt', reason: 'unsupportedFile' }],
      skippedPathCount: 1,
      predictedRawNodeCount: overrides.predictedRawNodeCount ?? 6,
      predictedTypedEdgeCount: overrides.predictedTypedEdgeCount ?? 5,
    },
  });
}

describe('folder-bundle creation preflight', () => {
  it('normalizes and deduplicates selections while configuring only explicit roots and the collection', async () => {
    const sourceDirectory = sourceFixture();
    let temporaryConfig = '';
    const result = await preflightFolderBundle({
      sourceDirectory,
      selectedFolders: [
        path.join(sourceDirectory, 'Projects'),
        'Projects/./',
        'Empty',
      ],
      bundleName: 'Research bundle',
    }, async args => {
      temporaryConfig = fs.readFileSync(args.bundleNodeConfigPath, 'utf8');
      return graphResult();
    });

    expect(result.plan.normalizedSelectedFolders).toEqual(['Projects', 'Empty']);
    expect(result.duplicateSelections).toEqual([{ inputIndex: 1, normalizedFolder: 'Projects' }]);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.filter(node => node.bundleNodeKind === 'folder').map(node => node.bundleNodeName))
      .toEqual(['Projects', 'Empty']);
    expect(result.nodes.find(node => node.bundleNodeKind === 'collection')).toMatchObject({
      bundleNodeName: 'Research bundle',
      memberBundleNodeIds: result.plan.folderBundleNodeIds,
    });
    expect(parseBundleNodeConfig(temporaryConfig)).toEqual(result.nodes
      .slice()
      .sort((a, b) => a.bundleNodeName.localeCompare(b.bundleNodeName)));
    expect(result.effectiveDefaultDepths).toEqual({ outlinks: 1, inlinks: 0 });
    expect(result.sensitiveNodeCount).toBe(1);
  });

  it('detects overlapping roots and rejects a stale source fingerprint', async () => {
    const sourceDirectory = sourceFixture();
    const runner = async () => graphResult();
    const first = await preflightFolderBundle({
      sourceDirectory,
      selectedFolders: ['', 'Projects'],
      bundleName: 'Everything',
      plannedFolderBundleNodeIds: ['r1b2c3d4e5f6', 'p1b2c3d4e5f6'],
      plannedCollectionBundleNodeId: 'c1b2c3d4e5f6',
    }, runner);
    expect(first.overlaps).toEqual([{ ancestor: '', descendant: 'Projects' }]);

    fs.writeFileSync(path.join(sourceDirectory, 'Projects', 'New.md'), '# New', 'utf8');
    await expect(verifyFolderBundlePreflight({
      sourceDirectory,
      selectedFolders: ['', 'Projects'],
      bundleName: 'Everything',
      plannedFolderBundleNodeIds: first.plan.folderBundleNodeIds,
      plannedCollectionBundleNodeId: first.plan.collectionBundleNodeId,
    }, first.fingerprint, runner)).rejects.toThrow(/preflight is stale/);
  });

  it('fails before persistence at the shared raw-node safety ceiling', async () => {
    const sourceDirectory = sourceFixture();
    await expect(preflightFolderBundle({
      sourceDirectory,
      selectedFolders: ['Projects'],
      bundleName: 'Large bundle',
    }, async () => graphResult({ predictedRawNodeCount: FOLDER_BUNDLE_MAX_RAW_NODES })))
      .rejects.toThrow(/too large.*Narrow the selected folders/s);
  });

  it('rejects selected folders that contain no supported files', async () => {
    const sourceDirectory = sourceFixture();
    await expect(preflightFolderBundle({
      sourceDirectory,
      selectedFolders: ['Empty'],
      bundleName: 'Empty bundle',
    }, async () => graphResult({ supportedSeedFileCount: 0 })))
      .rejects.toThrow('Selected folders do not contain any supported files');
  });

  it('uses the production graph builder for exact recursive predictions', async () => {
    const sourceDirectory = sourceFixture();
    const result = await preflightFolderBundle({
      sourceDirectory,
      selectedFolders: ['Projects', 'Empty'],
      bundleName: 'Real builder',
      plannedFolderBundleNodeIds: ['p1b2c3d4e5f6', 'e1b2c3d4e5f6'],
      plannedCollectionBundleNodeId: 'c1b2c3d4e5f6',
    });
    expect(result.supportedSeedFileCount).toBe(2);
    expect(result.requiredRawFolderNodeCount).toBe(3);
    expect(result.skippedCounts).toMatchObject({ unsupportedFile: 1 });
    expect(result.predictedRawNodeCount).toBeGreaterThanOrEqual(6);
    expect(result.predictedTypedEdgeCount).toBeGreaterThanOrEqual(5);
  });
});
