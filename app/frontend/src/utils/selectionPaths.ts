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

import { Graph, IPage } from '../../../shared_code/types/graph';

/**
 * Returns an ordered list of page IDs representing the selection for "path to here".
 *
 * Ordering is optimized for the selection sidebar: the "here" page comes first,
 * followed by its ancestors walking back toward the root.
 */
export function getSelectionPathToHereOrdered(page: IPage): string[] {
  const pathIds = Array.isArray(page.path) ? page.path : [];
  const ordered: string[] = [];

  // Always prioritize the clicked page at the top of selection
  if (typeof page.id === 'string' && page.id.length > 0) {
    ordered.push(page.id);
  }

  // Walk ancestors back toward the root (reverse the root->...->here path)
  for (let i = pathIds.length - 1; i >= 0; i--) {
    const id = pathIds[i];
    if (typeof id !== 'string' || id.length === 0) continue;
    if (id === page.id) continue;
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
 * Returns an ordered list of page IDs representing the selection for "path from here".
 *
 * This is a DFS over graph edges starting at startId, following:
 * - `edge.source -> edge.target` always
 * - and also `edge.target -> edge.source` when `edge.isBidirectional` is true
 *
 * Includes startId as the first element when present in the graph.
 */
/**
 * Returns an ordered list of page IDs representing the selection for "select children".
 *
 * Selects the page itself plus its direct children — pages connected by an
 * outgoing edge whose depth is exactly one more than the start page's depth.
 */
export function getSelectionChildrenOrdered(graph: Graph, startId: string): string[] {
  const startPage = graph.getPage(startId);
  if (!startPage) return [];

  const result: string[] = [startId];
  const startDepth = startPage.depth;

  for (const e of graph.getAllEdges()) {
    if (e.source !== startId) continue;
    const targetPage = graph.getPage(e.target);
    if (!targetPage) continue;
    if (targetPage.depth === startDepth + 1) {
      result.push(e.target);
    }
  }

  return result;
}

/**
 * Returns an ordered list of page IDs by DFS from startId, only following
 * edges to pages with a strictly higher depth number than the current page.
 */
export function getSelectionDeeperPathsFromHereOrdered(graph: Graph, startId: string): string[] {
  const startPage = graph.getPage(startId);
  if (!startPage) return [];

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
  const stack: Array<{ id: string; depth: number }> = [{ id: startId, depth: startPage.depth }];

  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const page = graph.getPage(id);
    if (page) {
      result.push(id);
    }

    const next = adjacency.get(id);
    if (!next || next.length === 0) continue;

    for (let i = next.length - 1; i >= 0; i--) {
      const to = next[i];
      if (visited.has(to)) continue;
      const neighborPage = graph.getPage(to);
      if (neighborPage && neighborPage.depth > depth) {
        stack.push({ id: to, depth: neighborPage.depth });
      }
    }
  }

  return result;
}

export function getSelectionPathFromHereOrdered(graph: Graph, startId: string): string[] {
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
  const stack: string[] = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Only include pages that exist in the graph (defensive for stale IDs)
    if (graph.getPage(id)) {
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


