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

import type { SiteEdgeKind } from './graph.js';

export interface FolderScopeSnapshotNode {
  siteNodeKey: string;
  siteNodeId?: string;
  siteNodeKind: 'file' | 'folder' | 'collection';
  siteNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: string;
  effectiveBlacklistingSiteNodeId?: string;
  effectiveFolderPolicySiteNodeId?: string;
  remaining_depth?: number;
  remaining_inlinks_depth?: number;
}

export interface FolderScopeGraphSnapshot {
  nodes: FolderScopeSnapshotNode[];
  edges: Array<{ source: string; target: string; siteEdgeKind: SiteEdgeKind }>;
  folderScope?: {
    skippedCounts: Record<string, number>;
    skippedPaths: Array<{ path: string; reason: string }>;
    skippedPathCount: number;
    supportedSeedFileCount: number;
    predictedRawNodeCount: number;
    predictedTypedEdgeCount: number;
  };
}

export type FolderScopeChangeCategory = 'addition' | 'removal' | 'move' | 'policy' | 'blacklist' | 'skipped';

export interface FolderScopeChangeItem {
  category: FolderScopeChangeCategory;
  code: string;
  message: string;
  siteNodeId?: string;
  siteNodeKey?: string;
  oldLocator?: string;
  newLocator?: string;
  affectedNodeCount?: number;
}

export interface FolderScopeChangeExplanation {
  basis: 'initial' | 'priorRebuild' | 'committedDraft';
  items: FolderScopeChangeItem[];
  rawNodeDelta: number;
  typedEdgeDelta: number;
  seedDelta: number;
  skippedCounts: Record<string, number>;
}
