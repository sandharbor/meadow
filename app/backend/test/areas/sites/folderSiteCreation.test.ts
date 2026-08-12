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
import { parseSiteNodeConfig } from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import {
  FOLDER_SITE_MAX_RAW_NODES,
  preflightFolderSite,
  verifyFolderSitePreflight,
} from '../../../src/areas/sites/services/folderSiteCreation.js';

const temporaryDirectories: string[] = [];

function sourceFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-site-test-'));
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
    nodes: [{ siteNodeKind: 'folder' }, { siteNodeKind: 'file', is_sensitive: true }],
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

describe('folder-site creation preflight', () => {
  it('normalizes and deduplicates selections while configuring only explicit roots and the collection', async () => {
    const sourceDirectory = sourceFixture();
    let temporaryConfig = '';
    const result = await preflightFolderSite({
      sourceDirectory,
      selectedFolders: [
        path.join(sourceDirectory, 'Projects'),
        'Projects/./',
        'Empty',
      ],
      siteName: 'Research site',
    }, async args => {
      temporaryConfig = fs.readFileSync(args.siteNodeConfigPath, 'utf8');
      return graphResult();
    });

    expect(result.plan.normalizedSelectedFolders).toEqual(['Projects', 'Empty']);
    expect(result.duplicateSelections).toEqual([{ inputIndex: 1, normalizedFolder: 'Projects' }]);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.filter(node => node.siteNodeKind === 'folder').map(node => node.siteNodeName))
      .toEqual(['Projects', 'Empty']);
    expect(result.nodes.find(node => node.siteNodeKind === 'collection')).toMatchObject({
      siteNodeName: 'Research site',
      memberSiteNodeIds: result.plan.folderSiteNodeIds,
    });
    expect(parseSiteNodeConfig(temporaryConfig)).toEqual(result.nodes
      .slice()
      .sort((a, b) => a.siteNodeName.localeCompare(b.siteNodeName)));
    expect(result.effectiveDefaultDepths).toEqual({ outlinks: 1, inlinks: 0 });
    expect(result.sensitiveNodeCount).toBe(1);
  });

  it('detects overlapping roots and rejects a stale source fingerprint', async () => {
    const sourceDirectory = sourceFixture();
    const runner = async () => graphResult();
    const first = await preflightFolderSite({
      sourceDirectory,
      selectedFolders: ['', 'Projects'],
      siteName: 'Everything',
      plannedFolderSiteNodeIds: ['r1b2c3d4e5f6', 'p1b2c3d4e5f6'],
      plannedCollectionSiteNodeId: 'c1b2c3d4e5f6',
    }, runner);
    expect(first.overlaps).toEqual([{ ancestor: '', descendant: 'Projects' }]);

    fs.writeFileSync(path.join(sourceDirectory, 'Projects', 'New.md'), '# New', 'utf8');
    await expect(verifyFolderSitePreflight({
      sourceDirectory,
      selectedFolders: ['', 'Projects'],
      siteName: 'Everything',
      plannedFolderSiteNodeIds: first.plan.folderSiteNodeIds,
      plannedCollectionSiteNodeId: first.plan.collectionSiteNodeId,
    }, first.fingerprint, runner)).rejects.toThrow(/preflight is stale/);
  });

  it('fails before persistence at the shared raw-node safety ceiling', async () => {
    const sourceDirectory = sourceFixture();
    await expect(preflightFolderSite({
      sourceDirectory,
      selectedFolders: ['Projects'],
      siteName: 'Large site',
    }, async () => graphResult({ predictedRawNodeCount: FOLDER_SITE_MAX_RAW_NODES })))
      .rejects.toThrow(/too large.*Narrow the selected folders/s);
  });

  it('uses the production graph builder for exact recursive predictions', async () => {
    const sourceDirectory = sourceFixture();
    const result = await preflightFolderSite({
      sourceDirectory,
      selectedFolders: ['Projects', 'Empty'],
      siteName: 'Real builder',
      plannedFolderSiteNodeIds: ['p1b2c3d4e5f6', 'e1b2c3d4e5f6'],
      plannedCollectionSiteNodeId: 'c1b2c3d4e5f6',
    });
    expect(result.supportedSeedFileCount).toBe(2);
    expect(result.requiredRawFolderNodeCount).toBe(3);
    expect(result.skippedCounts).toMatchObject({ unsupportedFile: 1 });
    expect(result.predictedRawNodeCount).toBeGreaterThanOrEqual(6);
    expect(result.predictedTypedEdgeCount).toBeGreaterThanOrEqual(5);
  });
});
