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
import type { ISiteNode } from '../types/ISiteNode.js';
import type { SiteNodeConfig, SiteNodeId, SiteNodeKey } from '../types/siteNodeConfig.js';

export interface VisibleStructuralProjection {
  renderedNodeKeys: SiteNodeKey[];
  childrenByNodeKey: Map<SiteNodeKey, SiteNodeKey[]>;
  parentByNodeKey: Map<SiteNodeKey, SiteNodeKey>;
  breadcrumbNodeKeysByNodeKey: Map<SiteNodeKey, SiteNodeKey[]>;
  semanticOnlyNodeKeys: SiteNodeKey[];
}

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true }) || left.localeCompare(right);

function compareDirectoryChildren(left: ISiteNode, right: ISiteNode): number {
  const rank = (node: ISiteNode): number => node.siteNodeKind === 'folder' ? 0 : node.siteNodeKind === 'file' ? 1 : 2;
  return rank(left) - rank(right)
    || compareText(left.siteNodeName, right.siteNodeName)
    || compareText(left.sourceGraphSubdirectory ?? '', right.sourceGraphSubdirectory ?? '')
    || compareText(left.siteNodeKind, right.siteNodeKind)
    || compareText(left.siteNodeId ?? left.siteNodeKey, right.siteNodeId ?? right.siteNodeKey);
}

/**
 * Contracts untracked folders out of the publishable structural hierarchy.
 * It never mutates the raw graph and never invents semantic edges.
 */
export function buildVisibleStructuralProjection(
  nodes: ISiteNode[],
  edges: IEdge[],
  configs: SiteNodeConfig[],
  entrySiteNodeId: SiteNodeId,
): VisibleStructuralProjection {
  const nodesByKey = new Map(nodes.map(node => [node.siteNodeKey, node]));
  const nodeById = new Map(nodes.flatMap(node => node.siteNodeId ? [[node.siteNodeId, node] as const] : []));
  const configById = new Map(configs.map(config => [config.siteNodeId, config]));
  const structuralChildren = new Map<SiteNodeKey, SiteNodeKey[]>();
  for (const edge of edges) {
    if (edge.siteEdgeKind === 'semanticLink') continue;
    const children = structuralChildren.get(edge.source as SiteNodeKey) ?? [];
    if (!children.includes(edge.target as SiteNodeKey)) children.push(edge.target as SiteNodeKey);
    structuralChildren.set(edge.source as SiteNodeKey, children);
  }

  const isBlocked = (node: ISiteNode): boolean => {
    if (node.effectiveBlacklistingSiteNodeId) return true;
    return Boolean(node.siteNodeId && configById.get(node.siteNodeId)?.listType === 'blacklist');
  };
  const isRendered = (node: ISiteNode): boolean => Boolean(
    node.siteNodeId && configById.get(node.siteNodeId)?.listType === 'whitelist' && !isBlocked(node)
  );
  const renderedNodeKeys = nodes.filter(isRendered).map(node => node.siteNodeKey).sort(compareText);

  const orderedRawChildren = (parent: ISiteNode): ISiteNode[] => {
    const raw = (structuralChildren.get(parent.siteNodeKey) ?? [])
      .map(key => nodesByKey.get(key))
      .filter((node): node is ISiteNode => Boolean(node));
    if (parent.siteNodeKind === 'collection') {
      const order = new Map(parent.memberSiteNodeIds.map((id, index) => [id, index]));
      return raw.sort((left, right) =>
        (order.get(left.siteNodeId as SiteNodeId) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right.siteNodeId as SiteNodeId) ?? Number.MAX_SAFE_INTEGER)
        || compareDirectoryChildren(left, right)
      );
    }
    return raw.sort(compareDirectoryChildren);
  };

  const firstVisibleDescendants = (parent: ISiteNode): SiteNodeKey[] => {
    const visible: SiteNodeKey[] = [];
    const seen = new Set<SiteNodeKey>();
    const visit = (candidate: ISiteNode, ancestry: Set<SiteNodeKey>): void => {
      if (ancestry.has(candidate.siteNodeKey) || isBlocked(candidate)) return;
      if (isRendered(candidate)) {
        if (!seen.has(candidate.siteNodeKey)) {
          seen.add(candidate.siteNodeKey);
          visible.push(candidate.siteNodeKey);
        }
        return;
      }
      if (candidate.siteNodeKind !== 'folder') return;
      const nextAncestry = new Set(ancestry).add(candidate.siteNodeKey);
      for (const child of orderedRawChildren(candidate)) visit(child, nextAncestry);
    };
    for (const child of orderedRawChildren(parent)) visit(child, new Set([parent.siteNodeKey]));
    return parent.siteNodeKind === 'collection'
      ? visible
      : visible.sort((left, right) => compareDirectoryChildren(nodesByKey.get(left)!, nodesByKey.get(right)!));
  };

  const childrenByNodeKey = new Map<SiteNodeKey, SiteNodeKey[]>();
  for (const key of renderedNodeKeys) {
    const node = nodesByKey.get(key);
    if (node && node.siteNodeKind !== 'file') childrenByNodeKey.set(key, firstVisibleDescendants(node));
  }

  const entry = nodeById.get(entrySiteNodeId);
  const parentByNodeKey = new Map<SiteNodeKey, SiteNodeKey>();
  const breadcrumbNodeKeysByNodeKey = new Map<SiteNodeKey, SiteNodeKey[]>();
  if (entry && isRendered(entry)) {
    breadcrumbNodeKeysByNodeKey.set(entry.siteNodeKey, [entry.siteNodeKey]);
    const pending: SiteNodeKey[] = [entry.siteNodeKey];
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
