/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from './bundleNodeConfig.js';

declare const sourceIdBrand: unique symbol;
declare const sourceRelativePathBrand: unique symbol;
declare const encodedBundleNodeKeyBrand: unique symbol;

export type SourceId = string & { readonly [sourceIdBrand]: true };
export type SourceRelativePath = string & { readonly [sourceRelativePathBrand]: true };

/**
 * A current address in one bundle's graph, distinct from persistent BundleNodeId.
 * File and folder paths are normalized, source-relative POSIX paths. The empty
 * path denotes a source root folder. An absent sourceId is the legacy single-source namespace.
 */
export type BundleNodeKey =
  | Readonly<{ kind: 'file'; sourceId?: SourceId; path: SourceRelativePath }>
  | Readonly<{ kind: 'folder'; sourceId?: SourceId; path: SourceRelativePath }>
  | Readonly<{ kind: 'collection'; bundleNodeId: BundleNodeId }>;

/** Validated canonical rendering for JSON, DOM attributes and value-based indexes. */
export type EncodedBundleNodeKey = string & { readonly [encodedBundleNodeKeyBrand]: true };
