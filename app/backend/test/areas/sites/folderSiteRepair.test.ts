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
import type { SiteConfig } from '../../../../shared_code/types/siteConfig.js';
import type { SiteNodeConfig, SiteNodeId } from '../../../../shared_code/types/siteNodeConfig.js';
import { parseSiteNodeConfig, stringifySiteNodeConfig } from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import {
  getFolderSiteRepairStatus,
  preflightSelectedFolderRelink,
  verifySelectedFolderRelink,
} from '../../../src/shared/site-config/folderSiteRepair.js';

const temporaryDirectories: string[] = [];

function fixture(kind: 'single' | 'multi'): { siteDirectory: string; sourceRoot: string; missingId: SiteNodeId } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-repair-test-'));
  temporaryDirectories.push(root);
  const sourceRoot = path.join(root, 'source');
  const siteDirectory = path.join(root, 'site');
  fs.mkdirSync(path.join(sourceRoot, 'Existing'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'Replacement'), { recursive: true });
  fs.mkdirSync(path.join(siteDirectory, 'conf'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'Replacement', 'Page.md'), '# Page', 'utf8');
  const missingId = 'm1b2c3d4e5f6' as SiteNodeId;
  const existingId = 'e1b2c3d4e5f6' as SiteNodeId;
  const collectionId = 'c1b2c3d4e5f6' as SiteNodeId;
  const nodes: SiteNodeConfig[] = [{
    siteNodeName: 'Missing',
    sourceGraphSubdirectory: 'Missing',
    siteNodeKind: 'folder',
    siteNodeId: missingId,
    listType: 'whitelist',
    outlinksDepth: 2,
  }];
  if (kind === 'multi') {
    nodes.push({
      siteNodeName: 'Existing',
      sourceGraphSubdirectory: 'Existing',
      siteNodeKind: 'folder',
      siteNodeId: existingId,
      listType: 'whitelist',
    }, {
      siteNodeName: 'Research',
      siteNodeKind: 'collection',
      siteNodeId: collectionId,
      listType: 'whitelist',
      memberSiteNodeIds: [existingId, missingId],
    });
  }
  const entrySiteNodeId = kind === 'single' ? missingId : collectionId;
  const siteConfig: SiteConfig = {
    sourceDirectory: sourceRoot,
    entrySiteNodeId,
    defaultTraversalSiteNodeId: entrySiteNodeId,
    defaultOutlinksDepth: 1,
    defaultInlinksDepth: 0,
  };
  fs.writeFileSync(path.join(siteDirectory, 'conf', 'site_node_config.yaml'), stringifySiteNodeConfig(nodes), 'utf8');
  fs.writeFileSync(path.join(siteDirectory, 'conf', 'site_config.yaml'), YAML.stringify(siteConfig), 'utf8');
  return { siteDirectory, sourceRoot, missingId };
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
  it('reports an exact missing entry locator without treating the site as malformed', () => {
    const { siteDirectory, missingId } = fixture('single');
    expect(getFolderSiteRepairStatus(siteDirectory)).toEqual({
      folderDerived: true,
      repairRequired: true,
      missingSelectedFolders: [{
        siteNodeId: missingId,
        siteNodeName: 'Missing',
        sourceGraphSubdirectory: 'Missing',
        role: 'entry',
        reason: 'missing',
      }],
    });
  });

  it('relinks a missing collection member while preserving identity, order, roles, and policy', async () => {
    const { siteDirectory, sourceRoot, missingId } = fixture('multi');
    const preflight = await preflightSelectedFolderRelink(
      siteDirectory,
      missingId,
      path.join(sourceRoot, 'Replacement'),
      async () => graphResult(),
    );
    expect(preflight).toMatchObject({
      oldLocator: 'Missing',
      newLocator: 'Replacement',
      newName: 'Replacement',
      preservedSiteNodeId: missingId,
      collectionMemberIndex: 1,
      remainingMissingSelectedFolders: [],
      prediction: { supportedSeedFileCount: 1, predictedRawNodeCount: 2, sensitiveNodeCount: 1 },
    });
    const verified = await verifySelectedFolderRelink(
      siteDirectory,
      missingId,
      'Replacement',
      preflight.fingerprint,
      async () => graphResult(),
    );
    const nodes = parseSiteNodeConfig(verified.serializedNodes);
    expect(nodes.find(node => node.siteNodeId === missingId)).toMatchObject({
      siteNodeName: 'Replacement',
      sourceGraphSubdirectory: 'Replacement',
      siteNodeId: missingId,
      outlinksDepth: 2,
    });
    expect(nodes.find(node => node.siteNodeKind === 'collection')).toMatchObject({
      memberSiteNodeIds: ['e1b2c3d4e5f6', missingId],
    });
  });

  it('does not modify configuration when repair is cancelled after preflight', async () => {
    const { siteDirectory, missingId } = fixture('single');
    const configPath = path.join(siteDirectory, 'conf', 'site_node_config.yaml');
    const before = fs.readFileSync(configPath, 'utf8');
    await preflightSelectedFolderRelink(siteDirectory, missingId, 'Replacement', async () => graphResult());
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('rejects a stale relink after the selected source tree changes', async () => {
    const { siteDirectory, sourceRoot, missingId } = fixture('single');
    const first = await preflightSelectedFolderRelink(siteDirectory, missingId, 'Replacement', async () => graphResult());
    fs.writeFileSync(path.join(sourceRoot, 'Replacement', 'Other.md'), '# Other', 'utf8');
    await expect(verifySelectedFolderRelink(
      siteDirectory, missingId, 'Replacement', first.fingerprint, async () => graphResult(),
    )).rejects.toThrow(/preflight is stale/);
  });
});
