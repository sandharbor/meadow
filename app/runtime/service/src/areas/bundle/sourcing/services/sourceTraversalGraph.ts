/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceTraversalGraph } from '../../../../../../../contracts/types/sourcing.js';
import { serializeWorkingGraphOutput, type WorkingGraphRustOutput } from '../../../../shared/bundle-graph/workingGraphService.js';

/** Reuse the exact graph used to build the review; do not rediscover live sources for details. */
export function sourceTraversalGraph(snapshotId: string, output: WorkingGraphRustOutput | undefined, routes: string[][], sources?: SourceTraversalGraph['sources']): SourceTraversalGraph | undefined {
  if (!output) return undefined;
  const keys = new Set(routes.flat());
  // Include the alternative explanations of each inspectable node, with their labels and policies.
  for (const node of output.nodes.filter(node => keys.has(node.bundleNodeKey))) {
    for (const route of node.traversal_alternative_routes ?? []) {
      route.forEach(step => keys.add(step.bundleNodeKey));
    }
  }
  const policies = new Set(output.nodes.filter(node => keys.has(node.bundleNodeKey)).map(node => node.effectiveFolderPolicyBundleNodeId).filter(Boolean));
  const nodes = output.nodes.filter(node => keys.has(node.bundleNodeKey) || (node.bundleNodeId && policies.has(node.bundleNodeId)));
  const selectedKeys = new Set(nodes.map(node => node.bundleNodeKey));
  const graph = serializeWorkingGraphOutput({ ...output, nodes,
    edges: output.edges.filter(edge => selectedKeys.has(edge.source) && selectedKeys.has(edge.target)),
    allLinkResolutionMaps: {}, allInlinkSources: {}, allOutlinkTargets: {},
  });
  return { snapshotId, ...(sources && { sources }), nodes: graph.nodes, edges: graph.edges };
}
