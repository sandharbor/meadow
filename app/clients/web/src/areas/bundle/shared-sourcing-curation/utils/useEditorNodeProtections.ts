/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useMemo } from 'react';
import type { Graph, IBundleNode } from '../../../../../../../contracts/types/graph.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

export function useEditorNodeProtections(graph: Graph, bundleNodeConfigs: BundleNodeConfig[] | null, protectedBundleNodeIds: Set<string>) {
  const untrackProtectedBundleNodeIds = useMemo(() => {
    const ids = new Set(protectedBundleNodeIds);
    for (const config of bundleNodeConfigs ?? []) {
      if (config.bundleNodeKind !== 'collection') continue;
      ids.add(config.bundleNodeId);
      for (const memberId of config.memberBundleNodeIds) ids.add(memberId);
    }
    return ids;
  }, [protectedBundleNodeIds, bundleNodeConfigs]);

  const structuralDescendants = useCallback((bundleNodeKey: EncodedBundleNodeKey): IBundleNode[] => {
    const result: IBundleNode[] = [];
    const pending = [bundleNodeKey];
    const seen = new Set(pending);
    while (pending.length > 0) {
      const current = pending.shift()!;
      for (const edge of graph.getOutgoingEdges(current)) {
        if (edge.bundleEdgeKind === 'semanticLink' || seen.has(edge.target)) continue;
        seen.add(edge.target);
        const child = graph.getNode(edge.target);
        if (child) {
          result.push(child);
          pending.push(child.bundleNodeKey);
        }
      }
    }
    return result;
  }, [graph]);

  const canBlacklistNode = useCallback((node: IBundleNode): boolean => {
    if (node.bundleNodeKind === 'collection') return false;
    if (node.bundleNodeId && protectedBundleNodeIds.has(node.bundleNodeId)) return false;
    if (node.bundleNodeKind === 'folder') {
      return !structuralDescendants(node.bundleNodeKey)
        .some(descendant => descendant.bundleNodeId && protectedBundleNodeIds.has(descendant.bundleNodeId));
    }
    return true;
  }, [protectedBundleNodeIds, structuralDescendants]);

  return { untrackProtectedBundleNodeIds, structuralDescendants, canBlacklistNode };
}
