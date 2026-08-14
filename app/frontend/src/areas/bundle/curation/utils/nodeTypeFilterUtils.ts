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

import type { Graph } from '../../../../../../shared_code/types/graph.js';
import type { INormalBundleNodeSelector } from './filterSelectors.js';
import type { NodeTypeFilterId } from '../types/filters.js';
import {
  createImageNodeSelector,
  createNonImageFileNodeSelector,
  createSelectedScopeRootSelector,
  createBundleNodeKindSelector,
} from './filterSelectors.js';

interface NodeTypeFilterDefinition {
  id: NodeTypeFilterId;
  label: string;
  createSelector: () => INormalBundleNodeSelector;
}

export interface PresentNodeTypeFilter {
  id: NodeTypeFilterId;
  label: string;
  nodeCount: number;
}

const NODE_TYPE_FILTER_DEFINITIONS: NodeTypeFilterDefinition[] = [
  { id: 'file', label: 'File Nodes', createSelector: createNonImageFileNodeSelector },
  { id: 'image', label: 'Image Nodes', createSelector: createImageNodeSelector },
  { id: 'folder', label: 'Folder Nodes', createSelector: () => createBundleNodeKindSelector('folder') },
  { id: 'collection', label: 'Bundle Homes', createSelector: () => createBundleNodeKindSelector('collection') },
  { id: 'selected-scope-root', label: 'Selected Scope Roots', createSelector: createSelectedScopeRootSelector },
];

export const getPresentNodeTypeFilters = (graph: Graph): PresentNodeTypeFilter[] => (
  NODE_TYPE_FILTER_DEFINITIONS
    .map(definition => ({
      id: definition.id,
      label: definition.label,
      nodeCount: definition.createSelector().select(graph).size,
    }))
    .filter(definition => definition.nodeCount > 0)
);

export const createNodeTypeFilterSelector = (id: NodeTypeFilterId): INormalBundleNodeSelector => {
  const definition = NODE_TYPE_FILTER_DEFINITIONS.find(candidate => candidate.id === id);
  if (!definition) throw new Error(`Unknown node type filter: ${id}`);
  return definition.createSelector();
};

export const getNodeTypeFilterLabel = (id: NodeTypeFilterId): string => {
  const definition = NODE_TYPE_FILTER_DEFINITIONS.find(candidate => candidate.id === id);
  if (!definition) throw new Error(`Unknown node type filter: ${id}`);
  return definition.label;
};
