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

import type { IEdge } from '../types/graph.js';
import type { IBundleNode } from '../types/IBundleNode.js';
import type { BundleNodeConfig, BundleNodeId, BundleNodeKey } from '../types/bundleNodeConfig.js';

export interface VisibleStructuralProjection {
  renderedNodeKeys: BundleNodeKey[];
  childrenByNodeKey: Map<BundleNodeKey, BundleNodeKey[]>;
  parentByNodeKey: Map<BundleNodeKey, BundleNodeKey>;
  breadcrumbNodeKeysByNodeKey: Map<BundleNodeKey, BundleNodeKey[]>;
  semanticOnlyNodeKeys: BundleNodeKey[];
}

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true }) || left.localeCompare(right);

function compareDirectoryChildren(left: IBundleNode, right: IBundleNode): number {
  const rank = (node: IBundleNode): number => node.bundleNodeKind === 'folder' ? 0 : node.bundleNodeKind === 'file' ? 1 : 2;
  return rank(left) - rank(right)
    || compareText(left.bundleNodeName, right.bundleNodeName)
    || compareText(left.sourceGraphSubdirectory ?? '', right.sourceGraphSubdirectory ?? '')
    || compareText(left.bundleNodeKind, right.bundleNodeKind)
    || compareText(left.bundleNodeId ?? left.bundleNodeKey, right.bundleNodeId ?? right.bundleNodeKey);
}

/**
 * Contracts untracked folders out of the publishable structural hierarchy.
 * It never mutates the raw graph and never invents semantic edges.
 */
export function buildVisibleStructuralProjection(
  nodes: IBundleNode[],
  edges: IEdge[],
  configs: BundleNodeConfig[],
  entryBundleNodeId: BundleNodeId,
): VisibleStructuralProjection {
  const nodesByKey = new Map(nodes.map(node => [node.bundleNodeKey, node]));
  const nodeById = new Map(nodes.flatMap(node => node.bundleNodeId ? [[node.bundleNodeId, node] as const] : []));
  const configById = new Map(configs.map(config => [config.bundleNodeId, config]));
  const structuralChildren = new Map<BundleNodeKey, BundleNodeKey[]>();
  for (const edge of edges) {
    if (edge.bundleEdgeKind === 'semanticLink') continue;
    const children = structuralChildren.get(edge.source as BundleNodeKey) ?? [];
    if (!children.includes(edge.target as BundleNodeKey)) children.push(edge.target as BundleNodeKey);
    structuralChildren.set(edge.source as BundleNodeKey, children);
  }

  const isBlocked = (node: IBundleNode): boolean => {
    if (node.effectiveBlacklistingBundleNodeId) return true;
    return Boolean(node.bundleNodeId && configById.get(node.bundleNodeId)?.listType === 'blacklist');
  };
  const isRendered = (node: IBundleNode): boolean => Boolean(
    node.bundleNodeId && configById.get(node.bundleNodeId)?.listType === 'whitelist' && !isBlocked(node)
  );
  const renderedNodeKeys = nodes.filter(isRendered).map(node => node.bundleNodeKey).sort(compareText);

  const orderedRawChildren = (parent: IBundleNode): IBundleNode[] => {
    const raw = (structuralChildren.get(parent.bundleNodeKey) ?? [])
      .map(key => nodesByKey.get(key))
      .filter((node): node is IBundleNode => Boolean(node));
    if (parent.bundleNodeKind === 'collection') {
      const order = new Map(parent.memberBundleNodeIds.map((id, index) => [id, index]));
      return raw.sort((left, right) =>
        (order.get(left.bundleNodeId as BundleNodeId) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right.bundleNodeId as BundleNodeId) ?? Number.MAX_SAFE_INTEGER)
        || compareDirectoryChildren(left, right)
      );
    }
    return raw.sort(compareDirectoryChildren);
  };

  const firstVisibleDescendants = (parent: IBundleNode): BundleNodeKey[] => {
    const visible: BundleNodeKey[] = [];
    const seen = new Set<BundleNodeKey>();
    const visit = (candidate: IBundleNode, ancestry: Set<BundleNodeKey>): void => {
      if (ancestry.has(candidate.bundleNodeKey) || isBlocked(candidate)) return;
      if (isRendered(candidate)) {
        if (!seen.has(candidate.bundleNodeKey)) {
          seen.add(candidate.bundleNodeKey);
          visible.push(candidate.bundleNodeKey);
        }
        return;
      }
      if (candidate.bundleNodeKind !== 'folder') return;
      const nextAncestry = new Set(ancestry).add(candidate.bundleNodeKey);
      for (const child of orderedRawChildren(candidate)) visit(child, nextAncestry);
    };
    for (const child of orderedRawChildren(parent)) visit(child, new Set([parent.bundleNodeKey]));
    return parent.bundleNodeKind === 'collection'
      ? visible
      : visible.sort((left, right) => compareDirectoryChildren(nodesByKey.get(left)!, nodesByKey.get(right)!));
  };

  const childrenByNodeKey = new Map<BundleNodeKey, BundleNodeKey[]>();
  for (const key of renderedNodeKeys) {
    const node = nodesByKey.get(key);
    if (node && node.bundleNodeKind !== 'file') childrenByNodeKey.set(key, firstVisibleDescendants(node));
  }

  const entry = nodeById.get(entryBundleNodeId);
  const parentByNodeKey = new Map<BundleNodeKey, BundleNodeKey>();
  const breadcrumbNodeKeysByNodeKey = new Map<BundleNodeKey, BundleNodeKey[]>();
  if (entry && isRendered(entry)) {
    breadcrumbNodeKeysByNodeKey.set(entry.bundleNodeKey, [entry.bundleNodeKey]);
    const pending: BundleNodeKey[] = [entry.bundleNodeKey];
    while (pending.length > 0) {
      const parentKey = pending.shift()!;
      const parentPath = breadcrumbNodeKeysByNodeKey.get(parentKey) ?? [parentKey];
      for (const childKey of childrenByNodeKey.get(parentKey) ?? []) {
        if (breadcrumbNodeKeysByNodeKey.has(childKey)) continue;
        parentByNodeKey.set(childKey, parentKey);
        breadcrumbNodeKeysByNodeKey.set(childKey, [...parentPath, childKey]);
        pending.push(childKey);
      }
    }
  }

  return {
    renderedNodeKeys,
    childrenByNodeKey,
    parentByNodeKey,
    breadcrumbNodeKeysByNodeKey,
    semanticOnlyNodeKeys: renderedNodeKeys.filter(key => !breadcrumbNodeKeysByNodeKey.has(key)),
  };
}
