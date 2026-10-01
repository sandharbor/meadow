/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeKey } from '../../contracts/types/bundleNodeKey.js';
import type { Graph } from '../../contracts/types/graph.js';
import { createFileNodeKey, serializeBundleNodeKey } from './bundleNodeKey.js';

/** Compile-time conformance: paths cannot flow into graph-key APIs. Never invoked. */
export function bundleNodeKeyTypeChecks(graph: Graph, path: string, key: BundleNodeKey): void {
  graph.getNode(key);
  graph.getNode(serializeBundleNodeKey(createFileNodeKey(path)));
  // @ts-expect-error A source path has no graph-key type.
  graph.getNode(path);
  // @ts-expect-error A key is a structured value, not a path string.
  const invalid: BundleNodeKey = path;
  void invalid;
  // @ts-expect-error A collection has a persistent ID and no source locator.
  const collection: BundleNodeKey = { kind: 'collection', path };
  void collection;
}
