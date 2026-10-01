/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { fileNodeKeyFromSourceGraphPath, encodedBundleNodeKey, serializeBundleNodeKey } from '../../../../shared_code/utils/bundleNodeKey.js';
import type { EncodedBundleNodeKey } from '../../../../contracts/types/bundleNodeKey.js';

/** Construct graph addresses for test nodes and graph assertions. */
export function testKey(path: string): EncodedBundleNodeKey {
  return /^(file|folder|collection):/.test(path) ? encodedBundleNodeKey(path)
    : serializeBundleNodeKey(fileNodeKeyFromSourceGraphPath(path.replace(/^\//, '')));
}

export function testKeySet(paths: Iterable<string>): Set<EncodedBundleNodeKey> {
  return new Set([...paths].map(testKey));
}
