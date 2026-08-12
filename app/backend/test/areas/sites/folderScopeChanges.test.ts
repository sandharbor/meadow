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
import type { FolderScopeGraphSnapshot } from '../../../../shared_code/types/folderScopeChanges.js';
import type { SiteNodeConfig } from '../../../../shared_code/types/siteNodeConfig.js';
import { explainFolderScopeChanges } from '../../../src/shared/site-config/folderScopeChanges.js';

const folder: SiteNodeConfig = {
  siteNodeName: 'Project', sourceGraphSubdirectory: 'Project', siteNodeKind: 'folder',
  siteNodeId: 'f1b2c3d4e5f6', listType: 'whitelist',
};

const base: FolderScopeGraphSnapshot = {
  nodes: [
    { siteNodeKey: 'folder:Project', siteNodeId: folder.siteNodeId, siteNodeKind: 'folder', siteNodeName: 'Project', sourceGraphSubdirectory: 'Project', effectiveFolderPolicySiteNodeId: folder.siteNodeId },
    { siteNodeKey: 'Project/A.md', siteNodeKind: 'file', siteNodeName: 'A', sourceGraphSubdirectory: 'Project', effectiveFolderPolicySiteNodeId: folder.siteNodeId },
  ],
  edges: [{ source: 'folder:Project', target: 'Project/A.md', siteEdgeKind: 'directoryContainment' }],
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
        siteNodeKey: 'Project/B.md', siteNodeKind: 'file', siteNodeName: 'B',
        sourceGraphSubdirectory: 'Project', effectiveFolderPolicySiteNodeId: folder.siteNodeId,
      }],
      edges: [...base.edges, { source: 'folder:Project', target: 'Project/B.md', siteEdgeKind: 'directoryContainment' }],
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
    const priorTracked: SiteNodeConfig = {
      siteNodeName: 'Old', sourceGraphSubdirectory: 'Project', siteNodeKind: 'file', fileType: 'md',
      siteNodeId: 'p1b2c3d4e5f6', listType: 'whitelist',
    };
    const oldNested: SiteNodeConfig = {
      siteNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', siteNodeKind: 'folder',
      siteNodeId: 'n1b2c3d4e5f6', listType: 'whitelist', outlinksDepth: 1,
    };
    const nextNested: SiteNodeConfig = { ...oldNested, listType: 'blacklist', outlinksDepth: 3 };
    const previous: FolderScopeGraphSnapshot = {
      ...base,
      nodes: [...base.nodes,
        { siteNodeKey: 'Project/Old.md', siteNodeId: priorTracked.siteNodeId, siteNodeKind: 'file', siteNodeName: 'Old', sourceGraphSubdirectory: 'Project', effectiveFolderPolicySiteNodeId: folder.siteNodeId },
        { siteNodeKey: 'folder:Project/Nested', siteNodeId: oldNested.siteNodeId, siteNodeKind: 'folder', siteNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicySiteNodeId: oldNested.siteNodeId },
      ],
    };
    const current: FolderScopeGraphSnapshot = {
      ...base,
      nodes: [...base.nodes,
        { siteNodeKey: 'Project/Moved.md', siteNodeId: priorTracked.siteNodeId, siteNodeKind: 'file', siteNodeName: 'Moved', sourceGraphSubdirectory: 'Project', effectiveFolderPolicySiteNodeId: folder.siteNodeId },
        { siteNodeKey: 'folder:Project/Nested', siteNodeId: oldNested.siteNodeId, siteNodeKind: 'folder', siteNodeName: 'Nested', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicySiteNodeId: oldNested.siteNodeId, effectiveBlacklistingSiteNodeId: oldNested.siteNodeId },
        { siteNodeKey: 'Project/Nested/Blocked.md', siteNodeKind: 'file', siteNodeName: 'Blocked', sourceGraphSubdirectory: 'Project/Nested', effectiveFolderPolicySiteNodeId: oldNested.siteNodeId, effectiveBlacklistingSiteNodeId: oldNested.siteNodeId },
      ],
    };
    const result = explainFolderScopeChanges({
      previous, current,
      previousConfigs: [folder, priorTracked, oldNested],
      currentConfigs: [folder, { ...priorTracked, siteNodeName: 'Moved' }, nextNested],
      basis: 'committedDraft',
    });
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'move', siteNodeId: priorTracked.siteNodeId }),
      expect.objectContaining({ code: 'folder-depth-changed', affectedNodeCount: 2 }),
      expect.objectContaining({ code: 'folder-blacklist-became-effective', affectedNodeCount: 2 }),
    ]));
    expect(result.items.filter(item => item.siteNodeId === priorTracked.siteNodeId && item.category !== 'move')).toEqual([]);
  });

  it('marks a removed configured node as an orphan rather than guessing a move', () => {
    const tracked: SiteNodeConfig = {
      siteNodeName: 'Gone', sourceGraphSubdirectory: 'Project', siteNodeKind: 'file', fileType: 'md',
      siteNodeId: 'g1b2c3d4e5f6', listType: 'whitelist',
    };
    const previous = { ...base, nodes: [...base.nodes, { siteNodeKey: 'Project/Gone.md', siteNodeId: tracked.siteNodeId, siteNodeKind: 'file' as const, siteNodeName: 'Gone', sourceGraphSubdirectory: 'Project' }] };
    const result = explainFolderScopeChanges({
      previous, current: base, previousConfigs: [folder, tracked], currentConfigs: [folder, tracked], basis: 'priorRebuild',
    });
    expect(result.items).toContainEqual(expect.objectContaining({ code: 'configured-node-orphaned', siteNodeId: tracked.siteNodeId }));
    expect(result.items.some(item => item.category === 'move')).toBe(false);
  });
});
