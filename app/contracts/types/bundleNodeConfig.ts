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

import type { FileType } from './FileType.js';

declare const bundleNodeIdBrand: unique symbol;
declare const bundleNodeKeyBrand: unique symbol;

/** Stable identity assigned only when a node is configured. */
export type BundleNodeId = string & { readonly [bundleNodeIdBrand]: true };

/** Locator-derived key used by the current working graph and its edges. */
export type BundleNodeKey = string & { readonly [bundleNodeKeyBrand]: true };

interface BaseBundleNodeConfig {
  bundleNodeName: string;
  bundleNodeId: BundleNodeId;
  listType: 'blacklist' | 'whitelist';
}

interface TraversalBundleNodeConfig {
  outlinksDepth?: number;
  inlinksDepth?: number;
}

export interface FileBundleNodeConfig extends BaseBundleNodeConfig, TraversalBundleNodeConfig {
  sourceGraphSubdirectory?: string;
  bundleNodeKind: 'file';
  fileType: FileType;
}

export interface FolderBundleNodeConfig extends BaseBundleNodeConfig, TraversalBundleNodeConfig {
  sourceGraphSubdirectory: string;
  bundleNodeKind: 'folder';
  fileType?: never;
  memberBundleNodeIds?: never;
}

export interface CollectionBundleNodeConfig extends BaseBundleNodeConfig {
  bundleNodeKind: 'collection';
  sourceGraphSubdirectory?: never;
  fileType?: never;
  outlinksDepth?: never;
  inlinksDepth?: never;
  memberBundleNodeIds: BundleNodeId[];
}

export type BundleNodeConfig =
  | FileBundleNodeConfig
  | FolderBundleNodeConfig
  | CollectionBundleNodeConfig;

export type BundleNodeKind = BundleNodeConfig['bundleNodeKind'];

export interface BundleNodeConfigDocument {
  nodes: BundleNodeConfig[];
}
