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
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../contracts/types/bundleNodeConfig.js';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  getFolderBundleRepairStatus,
  preflightSelectedFolderRelink,
  verifySelectedFolderRelink,
} from '../../../src/shared/bundle-config/folderBundleRepair.js';

const temporaryDirectories: string[] = [];

function fixture(kind: 'single' | 'multi'): { bundleDirectory: string; sourceRoot: string; missingId: BundleNodeId } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-repair-test-'));
  temporaryDirectories.push(root);
  const sourceRoot = path.join(root, 'source');
  const bundleDirectory = path.join(root, 'bundle');
  fs.mkdirSync(path.join(sourceRoot, 'Existing'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'Replacement'), { recursive: true });
  fs.mkdirSync(path.join(bundleDirectory, 'config'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'Replacement', 'Page.md'), '# Page', 'utf8');
  const missingId = 'm1b2c3d4e5f6' as BundleNodeId;
  const existingId = 'e1b2c3d4e5f6' as BundleNodeId;
  const collectionId = 'c1b2c3d4e5f6' as BundleNodeId;
  const nodes: BundleNodeConfig[] = [{
    bundleNodeName: 'Missing',
    sourceGraphSubdirectory: 'Missing',
    bundleNodeKind: 'folder',
    bundleNodeId: missingId,
    listType: 'whitelist',
    outlinksDepth: 2,
  }];
  if (kind === 'multi') {
    nodes.push({
      bundleNodeName: 'Existing',
      sourceGraphSubdirectory: 'Existing',
      bundleNodeKind: 'folder',
      bundleNodeId: existingId,
      listType: 'whitelist',
    }, {
      bundleNodeName: 'Research',
      bundleNodeKind: 'collection',
      bundleNodeId: collectionId,
      listType: 'whitelist',
      memberBundleNodeIds: [existingId, missingId],
    });
  }
  const entryBundleNodeId = kind === 'single' ? missingId : collectionId;
  const bundleConfig: BundleConfig = {
    sourceDirectory: sourceRoot,
    entryBundleNodeId,
    defaultTraversalBundleNodeId: entryBundleNodeId,
    defaultOutlinksDepth: 1,
    defaultInlinksDepth: 0,
  };
  fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_node_config.yaml'), stringifyBundleNodeConfig(nodes), 'utf8');
  fs.writeFileSync(path.join(bundleDirectory, 'config', 'bundle_config.yaml'), YAML.stringify(bundleConfig), 'utf8');
  return { bundleDirectory, sourceRoot, missingId };
}

function graphResult(): string {
  return JSON.stringify({
    nodes: [{ is_sensitive: false }, { is_sensitive: true }],
    edges: [{ source: 'a', target: 'b' }],
    folderScope: {
      supportedSeedFileCount: 1,
      requiredRawFolderNodeCount: 1,
      skippedCounts: {},
      skippedPaths: [],
      skippedPathCount: 0,
      predictedRawNodeCount: 2,
      predictedTypedEdgeCount: 1,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('selected-folder repair', () => {
  it('reports an exact missing entry locator without treating the bundle as malformed', () => {
    const { bundleDirectory, missingId } = fixture('single');
    expect(getFolderBundleRepairStatus(bundleDirectory)).toEqual({
      folderDerived: true,
      repairRequired: true,
      missingSelectedFolders: [{
        bundleNodeId: missingId,
        bundleNodeName: 'Missing',
        sourceGraphSubdirectory: 'Missing',
        role: 'entry',
        reason: 'missing',
      }],
    });
  });

  it('relinks a missing collection member while preserving identity, order, roles, and policy', async () => {
    const { bundleDirectory, sourceRoot, missingId } = fixture('multi');
    const preflight = await preflightSelectedFolderRelink(
      bundleDirectory,
      missingId,
      path.join(sourceRoot, 'Replacement'),
      async () => graphResult(),
    );
    expect(preflight).toMatchObject({
      oldLocator: 'Missing',
      newLocator: 'Replacement',
      newName: 'Replacement',
      preservedBundleNodeId: missingId,
      collectionMemberIndex: 1,
      remainingMissingSelectedFolders: [],
      prediction: { supportedSeedFileCount: 1, predictedRawNodeCount: 2, sensitiveNodeCount: 1 },
    });
    const verified = await verifySelectedFolderRelink(
      bundleDirectory,
      missingId,
      'Replacement',
      preflight.fingerprint,
      async () => graphResult(),
    );
    const nodes = parseBundleNodeConfig(verified.serializedNodes);
    expect(nodes.find(node => node.bundleNodeId === missingId)).toMatchObject({
      bundleNodeName: 'Replacement',
      sourceGraphSubdirectory: 'Replacement',
      bundleNodeId: missingId,
      outlinksDepth: 2,
    });
    expect(nodes.find(node => node.bundleNodeKind === 'collection')).toMatchObject({
      memberBundleNodeIds: ['e1b2c3d4e5f6', missingId],
    });
  });

  it('does not modify configuration when repair is cancelled after preflight', async () => {
    const { bundleDirectory, missingId } = fixture('single');
    const configPath = path.join(bundleDirectory, 'config', 'bundle_node_config.yaml');
    const before = fs.readFileSync(configPath, 'utf8');
    await preflightSelectedFolderRelink(bundleDirectory, missingId, 'Replacement', async () => graphResult());
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('rejects a stale relink after the selected source tree changes', async () => {
    const { bundleDirectory, sourceRoot, missingId } = fixture('single');
    const first = await preflightSelectedFolderRelink(bundleDirectory, missingId, 'Replacement', async () => graphResult());
    fs.writeFileSync(path.join(sourceRoot, 'Replacement', 'Other.md'), '# Other', 'utf8');
    await expect(verifySelectedFolderRelink(
      bundleDirectory, missingId, 'Replacement', first.fingerprint, async () => graphResult(),
    )).rejects.toThrow(/preflight is stale/);
  });
});
