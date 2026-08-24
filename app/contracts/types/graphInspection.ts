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

import type { IEdge } from './graph.js';
import type {
  CollectionBundleNode,
  FileBundleNode,
  FolderBundleNode,
  SerializableBundleNode,
} from './IBundleNode.js';
import type {
  CustomBundleNodeSelectorConfig,
  CustomFilterAction,
  CustomFilterScope,
} from './customFilters.js';

export type GraphInspectionScope = 'all' | 'final';
export type GraphFilterMode = 'solo' | 'exclude';
export type GraphFilterCombination = 'default' | 'union' | 'intersection' | 'difference';

export interface GraphHighlightAction {
  type: 'highlight';
  color: string;
  isDashed: boolean;
}

export interface GraphShowLabelsAction {
  type: 'show_labels';
}

export interface GraphShowTitlesAction {
  type: 'show_titles';
}

export interface GraphMarkSensitiveAction {
  type: 'mark_sensitive';
}

export type BuiltInGraphFilterAction =
  | GraphHighlightAction
  | GraphShowLabelsAction
  | GraphShowTitlesAction
  | GraphMarkSensitiveAction;

export type NodeTypeFilterId =
  | 'md'
  | 'html'
  | 'js'
  | 'css'
  | 'txt'
  | 'pdf'
  | 'other'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'svg'
  | 'webp'
  | 'excalidraw'
  | 'folder'
  | 'collection'
  | 'selected-scope-root';

export interface GraphFilterApplication {
  filterId: string;
  mode: GraphFilterMode;
}

export interface GraphFilterParameter {
  name: string;
  type: 'string' | 'integer';
  required: boolean;
  default?: string | number;
  description: string;
}

export interface GraphFilterDescriptor {
  id: string;
  name: string;
  description: string;
  scope: CustomFilterScope;
  kind: 'filter' | 'group';
  enabled: boolean;
  applicable: boolean;
  selectorApplicationCriteria?: 'union' | 'intersection';
  selectors?: CustomBundleNodeSelectorConfig[] | Array<Record<string, unknown>>;
  actions?: Array<CustomFilterAction | BuiltInGraphFilterAction>;
  parameters?: GraphFilterParameter[];
  children?: GraphFilterDescriptor[];
}

export interface GraphFilterCatalog {
  bundleSlug: string;
  filters: GraphFilterDescriptor[];
}

type BundleNodeField =
  | keyof FileBundleNode
  | keyof FolderBundleNode
  | keyof CollectionBundleNode;

export const GRAPH_DESCRIPTION_NODE_FIELDS = [
  'bundleNodeKey',
  'bundleNodeId',
  'bundleNodeKind',
  'label',
  'bundleNodeName',
  'sourceGraphSubdirectory',
  'fileType',
  'memberBundleNodeIds',
  'tracked',
  'blacklisted',
  'sensitive',
  'offTopic',
  'conf',
  'depth',
  'remaining_depth',
  'remaining_inlinks_depth',
  'path',
  'effectiveBlacklistingBundleNodeId',
  'effectiveFolderPolicyBundleNodeId',
  'isFrontierNode',
  'isFrontierImageExtension',
  'source_page_outlink_count',
  'source_page_inlink_count',
] as const satisfies readonly BundleNodeField[];

type GraphDescriptionNodeField = typeof GRAPH_DESCRIPTION_NODE_FIELDS[number];
type PickGraphDescriptionNodeFields<T> = T extends SerializableBundleNode
  ? Pick<T, Extract<keyof T, GraphDescriptionNodeField>>
  : never;

export type GraphDescriptionNode = PickGraphDescriptionNodeFields<SerializableBundleNode>;

export const GRAPH_DESCRIPTION_EDGE_FIELDS = [
  'source',
  'target',
  'bundleEdgeKind',
  'label',
  'isBidirectional',
] as const satisfies readonly (keyof IEdge)[];

export type GraphDescriptionEdge = Pick<
  IEdge,
  typeof GRAPH_DESCRIPTION_EDGE_FIELDS[number]
>;

export interface GraphDescription {
  bundleSlug: string;
  scope: GraphInspectionScope;
  filtering: {
    combine: GraphFilterCombination;
    applications: GraphFilterApplication[];
  };
  nodes: GraphDescriptionNode[];
  edges: GraphDescriptionEdge[];
}
