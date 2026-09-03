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

import type {
  CollectionBundleNodeConfig,
  FileBundleNodeConfig,
  FolderBundleNodeConfig,
  BundleNodeConfig,
  BundleNodeId,
  BundleNodeKey,
} from './bundleNodeConfig.js';
import type { FileType } from './FileType.js';
import type { BundleNodeTraversalDetails, BundleNodeTraversalStateSummary } from './bundleNodeGraph.js';

export interface LinkResolvedInfo {
  link_resolved_target_directory: string;
  link_resolved_target_path: string | null;
}

interface BaseBundleNode {
  bundleNodeKey: BundleNodeKey;
  bundleNodeId?: BundleNodeId;
  label: string; // Auto-generated short identifier (A, B, C, ... Z, AA, AB, etc)
  bundleNodeName: string;
  body?: string; // The content/body of the note
  tracked?: boolean;
  blacklisted?: boolean;
  sensitive?: boolean;
  offTopic?: boolean; // Whether the AI has marked this page as potentially off topic
  conf?: BundleNodeConfig; // Configuration for the node

  depth: number;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
  path?: string[]; // Traversal path from the start node to this node
  traversal_details?: BundleNodeTraversalDetails;
  traversal_states?: BundleNodeTraversalStateSummary[];
  effectiveBlacklistingBundleNodeId?: BundleNodeId;
  effectiveFolderPolicyBundleNodeId?: BundleNodeId;
  isFrontierNode?: boolean; // True if this node is beyond the normal working area boundary
  isFrontierImageExtension?: boolean; // True if this image was included because it was linked from a frontier-edge page
  source_page_outlink_count?: number;
  source_page_inlink_count?: number;

  // Map from link_original_text to resolved target info
  linkResolutionMap?: Record<string, LinkResolvedInfo>;

  // Additional metadata can still be stored in data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;

  getIdent(): string;
}

export interface FileBundleNode extends BaseBundleNode {
  bundleNodeKind: 'file';
  sourceGraphSubdirectory: string;
  fileType: FileType;
  conf?: FileBundleNodeConfig;
}

export interface FolderBundleNode extends BaseBundleNode {
  bundleNodeKind: 'folder';
  sourceGraphSubdirectory: string;
  fileType?: never;
  conf?: FolderBundleNodeConfig;
}

export interface CollectionBundleNode extends BaseBundleNode {
  bundleNodeKind: 'collection';
  sourceGraphSubdirectory?: never;
  fileType?: never;
  memberBundleNodeIds: BundleNodeId[];
  conf?: CollectionBundleNodeConfig;
}

export type IBundleNode = FileBundleNode | FolderBundleNode | CollectionBundleNode;

/** Frontier-image extensions remain trackable even though they also carry the frontier flag. */
export function isUntrackableFrontierNode(
  node: Pick<IBundleNode, 'isFrontierNode' | 'isFrontierImageExtension'>,
): boolean {
  return node.isFrontierNode === true && node.isFrontierImageExtension !== true;
}

type WithoutRuntimeMethods<T> = T extends IBundleNode ? Omit<T, 'getIdent'> : never;

/** The canonical bundle-node representation when crossing a JSON boundary. */
export type SerializableBundleNode = WithoutRuntimeMethods<IBundleNode>;

export function isFileBundleNode(node: IBundleNode): node is FileBundleNode {
  return node.bundleNodeKind === 'file';
}

export function isFolderBundleNode(node: IBundleNode): node is FolderBundleNode {
  return node.bundleNodeKind === 'folder';
}

export function isCollectionBundleNode(node: IBundleNode): node is CollectionBundleNode {
  return node.bundleNodeKind === 'collection';
}
