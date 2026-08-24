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

import { describe, expect, it } from 'vitest';
import type { FolderScopeGraphSnapshot } from '../../../../../contracts/types/folderScopeChanges.js';
import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import { explainFolderScopeChanges } from '../../../src/shared/bundle-config/folderScopeChanges.js';

const folder: BundleNodeConfig = {
  bundleNodeName: 'Project', sourceGraphSubdirectory: 'Project', bundleNodeKind: 'folder',
  bundleNodeId: 'f1b2c3d4e5f6', listType: 'whitelist',
};

const base: FolderScopeGraphSnapshot = {
  nodes: [
    { bundleNodeKey: 'folder:Project', bundleNodeId: folder.bundleNodeId, bundleNodeKind: 'folder', bundleNodeName: 'Project', sourceGraphSubdirectory: 'Project', effectiveFolderPolicyBundleNodeId: folder.bundleNodeId },
    { bundleNodeKey: 'Project/A.md', bundleNodeKind: 'file', bundleNodeName: 'A', sourceGraphSubdirectory: 'Project', effectiveFolderPolicyBundleNodeId: folder.bundleNodeId },
  ],
  edges: [{ source: 'folder:Project', target: 'Project/A.md', bundleEdgeKind: 'directoryContainment' }],
  folderScope: {
    supportedSeedFileCount: 1, predictedRawNodeCount: 2, predictedTypedEdgeCount: 1,
    skippedCounts: { unsupportedFile: 1 }, skippedPaths: [], skippedPathCount: 1,
  },
};

describe('folder scope change explanations', () => {
  it('separates contained additions and skipped paths from graph deltas', () => {
    const current: FolderScopeGraphSnapshot = {
      ...base,
      nodes: [...base.nodes, {
        bundleNodeKey: 'Project/B.md', bundleNodeKind: 'file', bundleNodeName: 'B',
        sourceGraphSubdirectory: 'Project', effectiveFolderPolicyBundleNodeId: folder.bundleNodeId,
      }],
      edges: [...base.edges, { source: 'folder:Project', target: 'Project/B.md', bundleEdgeKind: 'directoryContainment' }],
      folderScope: {
        ...base.folderScope!, supportedSeedFileCount: 2, predictedRawNodeCount: 3,
        predictedTypedEdgeCount: 2, skippedCounts: { unsupportedFile: 2, hiddenDescendant: 1 },
      },
    };
    const result = explainFolderScopeChanges({
      previous: base, current, previousConfigs: [folder], currentConfigs: [folder], basis: 'priorRebuild',
    });
    expect(result).toMatchObject({ rawNodeDelta: 1, typedEdgeDelta: 1, seedDelta: 1 });
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'addition', code: 'untracked-node-added', message: expect.stringContaining('added under Project and remains untracked') }),
      expect.objectContaining({ category: 'skipped', code: 'skipped-hiddenDescendant' }),
      expect.objectContaining({ category: 'skipped', code: 'skipped-unsupportedFile' }),
    ]));
  });

  it('explains configured orphans, stable moves, policy changes, and hard blacklists causally', () => {
    const priorTracked: BundleNodeConfig = {
      bundleNodeName: 'Old', sourceGraphSubdirectory: 'Project', bundleNodeKind: 'file', fileType: 'md',
      bundleNodeId: 'p1b2c3d4e5f6', listType: 'whitelist',
    };
    const oldNested: BundleNodeConfig = {
      bundleNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', bundleNodeKind: 'folder',
      bundleNodeId: 'n1b2c3d4e5f6', listType: 'whitelist', outlinksDepth: 1,
    };
    const nextNested: BundleNodeConfig = { ...oldNested, listType: 'blacklist', outlinksDepth: 3 };
    const previous: FolderScopeGraphSnapshot = {
      ...base,
      nodes: [...base.nodes,
        { bundleNodeKey: 'Project/Old.md', bundleNodeId: priorTracked.bundleNodeId, bundleNodeKind: 'file', bundleNodeName: 'Old', sourceGraphSubdirectory: 'Project', effectiveFolderPolicyBundleNodeId: folder.bundleNodeId },
        { bundleNodeKey: 'folder:Project/Nested', bundleNodeId: oldNested.bundleNodeId, bundleNodeKind: 'folder', bundleNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicyBundleNodeId: oldNested.bundleNodeId },
      ],
    };
    const current: FolderScopeGraphSnapshot = {
      ...base,
      nodes: [...base.nodes,
        { bundleNodeKey: 'Project/Moved.md', bundleNodeId: priorTracked.bundleNodeId, bundleNodeKind: 'file', bundleNodeName: 'Moved', sourceGraphSubdirectory: 'Project', effectiveFolderPolicyBundleNodeId: folder.bundleNodeId },
        { bundleNodeKey: 'folder:Project/Nested', bundleNodeId: oldNested.bundleNodeId, bundleNodeKind: 'folder', bundleNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicyBundleNodeId: oldNested.bundleNodeId, effectiveBlacklistingBundleNodeId: oldNested.bundleNodeId },
        { bundleNodeKey: 'Project/Nested/Blocked.md', bundleNodeKind: 'file', bundleNodeName: 'Blocked', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicyBundleNodeId: oldNested.bundleNodeId, effectiveBlacklistingBundleNodeId: oldNested.bundleNodeId },
      ],
    };
    const result = explainFolderScopeChanges({
      previous, current,
      previousConfigs: [folder, priorTracked, oldNested],
      currentConfigs: [folder, { ...priorTracked, bundleNodeName: 'Moved' }, nextNested],
      basis: 'committedDraft',
    });
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'move', bundleNodeId: priorTracked.bundleNodeId }),
      expect.objectContaining({ code: 'folder-depth-changed', affectedNodeCount: 2 }),
      expect.objectContaining({ code: 'folder-blacklist-became-effective', affectedNodeCount: 2 }),
    ]));
    expect(result.items.filter(item => item.bundleNodeId === priorTracked.bundleNodeId && item.category !== 'move')).toEqual([]);
  });

  it('marks a removed configured node as an orphan rather than guessing a move', () => {
    const tracked: BundleNodeConfig = {
      bundleNodeName: 'Gone', sourceGraphSubdirectory: 'Project', bundleNodeKind: 'file', fileType: 'md',
      bundleNodeId: 'g1b2c3d4e5f6', listType: 'whitelist',
    };
    const previous = { ...base, nodes: [...base.nodes, { bundleNodeKey: 'Project/Gone.md', bundleNodeId: tracked.bundleNodeId, bundleNodeKind: 'file' as const, bundleNodeName: 'Gone', sourceGraphSubdirectory: 'Project' }] };
    const result = explainFolderScopeChanges({
      previous, current: base, previousConfigs: [folder, tracked], currentConfigs: [folder, tracked], basis: 'priorRebuild',
    });
    expect(result.items).toContainEqual(expect.objectContaining({ code: 'configured-node-orphaned', bundleNodeId: tracked.bundleNodeId }));
    expect(result.items.some(item => item.category === 'move')).toBe(false);
  });
});
