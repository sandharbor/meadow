/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Graph } from '../../../../../contracts/types/graph.js';
import type { BundleNodeTraversalDetails } from '../../../../../contracts/types/bundleNodeGraph.js';

export type TraversalLinkType = NonNullable<BundleNodeTraversalDetails['link_type']> | 'unknown';

/** Direction is relative to the previous step, including when the stored edge points backwards. */
export function traversalLinkType(graph: Graph, previousKey: string | undefined, key: string): TraversalLinkType {
  if (previousKey === undefined) return 'start';
  const forward = graph.getOutgoingEdges(previousKey).find(edge => edge.target === key);
  if (forward && forward.bundleEdgeKind !== 'semanticLink') return forward.bundleEdgeKind;
  const node = graph.getNode(key);
  const recorded = node?.traversal_details?.link_type;
  if (node?.path?.at(-2) === previousKey && recorded && recorded !== 'start') return recorded;
  const reverse = graph.getIncomingEdges(previousKey).find(edge => edge.source === key && edge.bundleEdgeKind === 'semanticLink');
  if ((forward && reverse) || forward?.isBidirectional || reverse?.isBidirectional) return 'bidirectional';
  if (forward) return 'outlink';
  if (reverse) return 'inlink';
  return 'unknown';
}
