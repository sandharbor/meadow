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

import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';

/**
 * Returns an ordered list of node IDs representing the selection for "path to here".
 *
 * Ordering is optimized for the selection sidebar: the "here" node comes first,
 * followed by its ancestors walking back toward the root.
 */
export function getSelectionPathToHereOrdered(node: IBundleNode): string[] {
  const pathNodeKeys = Array.isArray(node.path) ? node.path : [];
  const ordered: string[] = [];

  // Always prioritize the clicked node at the top of selection
  if (typeof node.bundleNodeKey === 'string' && node.bundleNodeKey.length > 0) {
    ordered.push(node.bundleNodeKey);
  }

  // Walk ancestors back toward the root (reverse the root->...->here path)
  for (let i = pathNodeKeys.length - 1; i >= 0; i--) {
    const id = pathNodeKeys[i];
    if (typeof id !== 'string' || id.length === 0) continue;
    if (id === node.bundleNodeKey) continue;
    ordered.push(id);
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  return ordered.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Returns an ordered list of node IDs representing the selection for "path from here".
 *
 * This is a DFS over graph edges starting at startNodeKey, following:
 * - `edge.source -> edge.target` always
 * - and also `edge.target -> edge.source` when `edge.isBidirectional` is true
 *
 * Includes startNodeKey as the first element when present in the graph.
 */
/**
 * Returns an ordered list of node IDs representing the selection for "select children".
 *
 * Selects the node itself plus its direct children. Structural containment
 * edges already encode a direct parent/child relationship, while semantic
 * links retain the legacy depth + 1 behavior.
 */
export function getSelectionChildrenOrdered(graph: Graph, startNodeKey: string): string[] {
  const startPage = graph.getNode(startNodeKey);
  if (!startPage) return [];

  const result: string[] = [startNodeKey];
  const startDepth = startPage.depth;

  for (const e of graph.getAllEdges()) {
    if (e.source !== startNodeKey) continue;
    const targetPage = graph.getNode(e.target);
    if (!targetPage) continue;
    if (e.bundleEdgeKind !== 'semanticLink' || targetPage.depth === startDepth + 1) {
      result.push(e.target);
    }
  }

  return result;
}

/**
 * Returns an ordered list of node IDs by DFS from startNodeKey, only following
 * edges to nodes with a strictly higher depth number than the current node.
 */
export function getSelectionDeeperPathsFromHereOrdered(graph: Graph, startNodeKey: string): string[] {
  const startPage = graph.getNode(startNodeKey);
  if (!startPage) return [];

  const adjacency = new Map<string, Array<{ id: string; isStructural: boolean }>>();
  for (const e of graph.getAllEdges()) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    const isStructural = e.bundleEdgeKind !== 'semanticLink';
    adjacency.get(e.source)!.push({ id: e.target, isStructural });
    if (e.isBidirectional) {
      if (!adjacency.has(e.target)) adjacency.set(e.target, []);
      adjacency.get(e.target)!.push({ id: e.source, isStructural });
    }
  }

  const visited = new Set<string>();
  const result: string[] = [];
  const stack: Array<{ id: string; depth: number }> = [{ id: startNodeKey, depth: startPage.depth }];

  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = graph.getNode(id);
    if (node) {
      result.push(id);
    }

    const next = adjacency.get(id);
    if (!next || next.length === 0) continue;

    for (let i = next.length - 1; i >= 0; i--) {
      const { id: to, isStructural } = next[i];
      if (visited.has(to)) continue;
      const neighborPage = graph.getNode(to);
      if (neighborPage && (isStructural || neighborPage.depth > depth)) {
        stack.push({ id: to, depth: neighborPage.depth });
      }
    }
  }

  return result;
}

export function getSelectionPathFromHereOrdered(graph: Graph, startNodeKey: string): string[] {
  const adjacency = new Map<string, string[]>();
  for (const e of graph.getAllEdges()) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)!.push(e.target);
    if (e.isBidirectional) {
      if (!adjacency.has(e.target)) adjacency.set(e.target, []);
      adjacency.get(e.target)!.push(e.source);
    }
  }

  const visited = new Set<string>();
  const result: string[] = [];
  const stack: string[] = [startNodeKey];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Only include nodes that exist in the graph (defensive for stale IDs)
    if (graph.getNode(id)) {
      result.push(id);
    }

    const next = adjacency.get(id);
    if (!next || next.length === 0) continue;

    // Push in reverse so the traversal is stable with natural edge order.
    for (let i = next.length - 1; i >= 0; i--) {
      const to = next[i];
      if (!visited.has(to)) stack.push(to);
    }
  }

  return result;
}

