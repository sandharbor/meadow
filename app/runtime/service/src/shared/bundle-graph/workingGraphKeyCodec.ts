/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { EncodedBundleNodeKey } from '../../../../../contracts/types/bundleNodeKey.js';
import type { WorkingGraphRustOutput } from './workingGraphService.js';
import { encodedBundleNodeKey, fileNodeKeyFromSourceGraphPath, serializeBundleNodeKey } from '../../../../../shared_code/utils/bundleNodeKey.js';

/** Only retained, pre-versioned graph data may contain historical path-shaped keys. */
export function migrateLegacyBundleNodeKey(value: string, kind?: 'file' | 'folder' | 'collection'): EncodedBundleNodeKey {
  if (kind !== 'file' && (value.startsWith('folder:') || value.startsWith('collection:'))) return encodedBundleNodeKey(value);
  return serializeBundleNodeKey(fileNodeKeyFromSourceGraphPath(value.replace(/^\//, '')));
}

/** Validate all graph addresses at the native/storage boundary, including keys outside the node inventory. */
export function decodeWorkingGraphKeys(graph: WorkingGraphRustOutput, retainedLegacyGraph = false): WorkingGraphRustOutput {
  const legacy = graph.keyEncodingVersion === undefined && retainedLegacyGraph;
  if (!legacy && graph.keyEncodingVersion !== 1) throw new Error('Unsupported working graph key encoding.');
  const known = new Map<string, EncodedBundleNodeKey>(graph.nodes.map(node => [node.bundleNodeKey, legacy ? migrateLegacyBundleNodeKey(node.bundleNodeKey, node.bundleNodeKind) : encodedBundleNodeKey(node.bundleNodeKey)]));
  const key = (value: string): EncodedBundleNodeKey => known.get(value)
    ?? (legacy ? migrateLegacyBundleNodeKey(value) : encodedBundleNodeKey(value));
  const steps = (route: NonNullable<WorkingGraphRustOutput['nodes'][number]['traversal_path_steps']>) => route.map(step => ({ ...step, bundleNodeKey: key(step.bundleNodeKey) }));
  const links = (map: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>) => Object.fromEntries(Object.entries(map ?? {}).map(([value, targets]) => [key(value), targets.map(key)]));
  return { ...graph, keyEncodingVersion: 1,
    nodes: graph.nodes.map(node => ({ ...node, bundleNodeKey: key(node.bundleNodeKey), path: node.path.map(key),
      ...(node.traversal_path_steps && { traversal_path_steps: steps(node.traversal_path_steps) }),
      ...(node.traversal_alternative_routes && { traversal_alternative_routes: node.traversal_alternative_routes.map(steps) }),
    })),
    edges: graph.edges.map(edge => ({ ...edge, source: key(edge.source), target: key(edge.target) })),
    allLinkResolutionMaps: Object.fromEntries(Object.entries(graph.allLinkResolutionMaps ?? {}).map(([value, resolutions]) => [key(value), resolutions])),
    allInlinkSources: links(graph.allInlinkSources), allOutlinkTargets: links(graph.allOutlinkTargets),
  };
}
