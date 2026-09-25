/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Graph } from '../../../../../../../contracts/types/graph.js';
import type { SourceTraversalGraph, SourcingReview } from '../../../../../../../contracts/types/sourcing.js';

function hydrate(source?: SourceTraversalGraph): Graph | undefined {
  if (!source) return undefined;
  const graph = new Graph();
  graph.sources = source.sources ?? [];
  source.nodes.forEach(node => graph.addNode({ ...node, getIdent: () => node.bundleNodeKey }));
  source.edges.forEach(edge => graph.addEdge(edge));
  return graph;
}

export function useSourceTraversal(review: SourcingReview | null, bundleSlug: string) {
  const [selection, setSelection] = useState<{ side: 'accepted' | 'candidate'; key: string } | null>(null);
  const addedNodeKeys = useMemo(() => new Set(review?.changes.filter(change => change.kind === 'added').map(change => change.path)), [review]);
  const graphs = useMemo(() => ({
    accepted: review?.traversalGraphs?.accepted?.snapshotId === review?.accepted.id ? hydrate(review?.traversalGraphs?.accepted) : undefined,
    candidate: review?.traversalGraphs?.candidate?.snapshotId === review?.candidate?.id ? hydrate(review?.traversalGraphs?.candidate) : undefined,
  }), [review]);
  useEffect(() => { setSelection(null); }, [review?.reviewToken, bundleSlug]);
  const close = useCallback(() => setSelection(null), []);
  const show = (side: 'accepted' | 'candidate', key: string) => {
    if (graphs[side]?.getNode(key)?.path?.length) setSelection({ side, key });
  };
  const graph = selection ? graphs[selection.side] : undefined;
  const node = selection ? graph?.getNode(selection.key) : undefined;
  const snapshot = selection ? review?.[selection.side] : undefined;
  return { graphs, show, close, selection, details: graph && node && snapshot ? {
    graph, selectedNode: node,
    addedNodeKeys: selection!.side === 'candidate' ? addedNodeKeys : undefined,
  } : null };
}
