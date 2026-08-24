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

import type { FileType } from '../../contracts/types/FileType.js';
import type {
  BuiltInGraphFilterAction,
  GraphFilterDescriptor,
  NodeTypeFilterId,
} from '../../contracts/types/graphInspection.js';
import {
  createBlacklistedNodeSelector,
  createBundleNodeKindSelector,
  createFileTypeNodeSelector,
  createFrontierNodeSelector,
  createInlinkDiscrepancySelector,
  createNodeWithOverrideSelector,
  createOutlinkDiscrepancySelector,
  createSearchByTitleSelector,
  createSelectedScopeRootSelector,
  createSensitiveNodeSelector,
  createUntrackedNodeSelector,
  type IBundleNodeSelector,
} from './filterSelectors.js';

export interface NodeTypeFilterDefinition {
  id: NodeTypeFilterId;
  label: string;
  createSelector: () => IBundleNodeSelector;
  selectorDescription: Record<string, unknown>;
}

export interface BuiltInGraphFilterPresentation {
  includeInFrontend?: boolean;
  showSearchInput?: boolean;
  showThresholdInput?: boolean;
  thresholdValue?: number;
  thresholdLabel?: string;
  thresholdMax?: number;
  hideFromFilterList?: boolean;
  cannotHide?: boolean;
  control?: 'node-types' | 'folders' | 'gap';
}

export interface BuiltInGraphFilterDescriptor extends Omit<GraphFilterDescriptor, 'actions' | 'children' | 'scope'> {
  scope: 'bundle';
  actions: BuiltInGraphFilterAction[];
  children?: BuiltInGraphFilterDescriptor[];
}

export interface BuiltInGraphFilterDefinition {
  descriptor: BuiltInGraphFilterDescriptor;
  createSelectors?: () => IBundleNodeSelector[];
  presentation?: BuiltInGraphFilterPresentation;
  children: BuiltInGraphFilterDefinition[];
}

interface DefinitionInput extends Omit<BuiltInGraphFilterDescriptor, 'children' | 'scope'> {
  createSelectors?: () => IBundleNodeSelector[];
  presentation?: BuiltInGraphFilterPresentation;
  children?: BuiltInGraphFilterDefinition[];
}

function defineFilter(input: DefinitionInput): BuiltInGraphFilterDefinition {
  const {
    createSelectors,
    presentation,
    children = [],
    ...descriptor
  } = input;
  return {
    descriptor: {
      ...descriptor,
      scope: 'bundle',
      ...(children.length > 0
        ? { children: children.map(child => child.descriptor) }
        : {}),
    },
    ...(createSelectors ? { createSelectors } : {}),
    ...(presentation ? { presentation } : {}),
    children,
  };
}

function fileTypeDefinition(
  id: NodeTypeFilterId,
  label: string,
  fileTypes: readonly FileType[],
): NodeTypeFilterDefinition {
  return {
    id,
    label,
    createSelector: () => createFileTypeNodeSelector(fileTypes, label),
    selectorDescription: { type: 'fileType', fileTypes },
  };
}

export const NODE_TYPE_FILTER_DEFINITIONS: readonly NodeTypeFilterDefinition[] = [
  fileTypeDefinition('md', 'Markdown', ['md']),
  fileTypeDefinition('html', 'HTML', ['html']),
  fileTypeDefinition('js', 'JavaScript', ['js']),
  fileTypeDefinition('css', 'CSS', ['css']),
  fileTypeDefinition('txt', 'Text', ['txt']),
  fileTypeDefinition('pdf', 'PDF', ['pdf']),
  fileTypeDefinition('other', 'Other Files', ['other']),
  fileTypeDefinition('png', 'PNG', ['png']),
  fileTypeDefinition('jpeg', 'JPEG', ['jpg', 'jpeg']),
  fileTypeDefinition('gif', 'GIF', ['gif']),
  fileTypeDefinition('svg', 'SVG', ['svg']),
  fileTypeDefinition('webp', 'WebP', ['webp']),
  fileTypeDefinition('excalidraw', 'Excalidraw', ['excalidraw']),
  {
    id: 'folder',
    label: 'Folder Nodes',
    createSelector: () => createBundleNodeKindSelector('folder'),
    selectorDescription: { type: 'bundleNodeKind', bundleNodeKind: 'folder' },
  },
  {
    id: 'collection',
    label: 'Bundle Homes',
    createSelector: () => createBundleNodeKindSelector('collection'),
    selectorDescription: { type: 'bundleNodeKind', bundleNodeKind: 'collection' },
  },
  {
    id: 'selected-scope-root',
    label: 'Selected Scope Roots',
    createSelector: createSelectedScopeRootSelector,
    selectorDescription: { type: 'selectedScopeRoot' },
  },
];

const nodeTypeChildren = NODE_TYPE_FILTER_DEFINITIONS.map(definition => defineFilter({
  id: `node-types-filter-${definition.id}`,
  name: definition.label,
  description: `Nodes with the ${definition.label} type or role.`,
  kind: 'filter',
  enabled: false,
  applicable: true,
  selectorApplicationCriteria: 'union',
  selectors: [definition.selectorDescription],
  actions: [],
  createSelectors: () => [definition.createSelector()],
  presentation: { includeInFrontend: false },
}));

const outlinkGapFilter = defineFilter({
  id: 'outlink-gap-filter',
  name: 'Outlink Gap',
  description: 'Nodes with at least five source-graph outlinks missing from the working graph.',
  kind: 'filter',
  enabled: false,
  applicable: true,
  selectorApplicationCriteria: 'union',
  selectors: [{ type: 'outlinkGap', threshold: 5 }],
  actions: [{ type: 'highlight', color: '#CDDC39', isDashed: false }],
  createSelectors: () => [createOutlinkDiscrepancySelector(5)],
  presentation: {
    showThresholdInput: true,
    thresholdValue: 5,
    hideFromFilterList: true,
  },
});

const inlinkGapFilter = defineFilter({
  id: 'inlink-gap-filter',
  name: 'Inlink Gap',
  description: 'Nodes with at least five source-graph inlinks missing from the working graph.',
  kind: 'filter',
  enabled: false,
  applicable: true,
  selectorApplicationCriteria: 'union',
  selectors: [{ type: 'inlinkGap', threshold: 5 }],
  actions: [{ type: 'highlight', color: '#E91E63', isDashed: false }],
  createSelectors: () => [createInlinkDiscrepancySelector(5)],
  presentation: {
    showThresholdInput: true,
    thresholdValue: 5,
    hideFromFilterList: true,
  },
});

export const BUILT_IN_GRAPH_FILTER_DEFINITIONS: readonly BuiltInGraphFilterDefinition[] = [
  defineFilter({
    id: 'search-by-title-filter',
    name: 'Search By Title',
    description: 'Find nodes whose titles contain a search string.',
    kind: 'filter',
    enabled: true,
    applicable: false,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'titleSearch' }],
    actions: [
      { type: 'highlight', color: '#009688', isDashed: false },
      { type: 'show_titles' },
    ],
    parameters: [{
      name: 'query',
      type: 'string',
      required: true,
      description: 'Case-insensitive title substring containing at least two characters.',
    }],
    createSelectors: () => [createSearchByTitleSelector()],
    presentation: { showSearchInput: true },
  }),
  defineFilter({
    id: 'untracked-filter',
    name: 'Untracked',
    description: 'Pages not yet tracked for publishing. New source pages appear here after they are added to the source directory',
    kind: 'filter',
    enabled: false,
    applicable: true,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'tracking', tracked: false }],
    actions: [{ type: 'highlight', color: '#2196F3', isDashed: true }],
    createSelectors: () => [createUntrackedNodeSelector()],
  }),
  defineFilter({
    id: 'sensitive-filter',
    name: 'Sensitive',
    description: 'Pages with meadow-sensitive: true property in the source page. Sensitive pages are automatically excluded from bulk tracking',
    kind: 'filter',
    enabled: true,
    applicable: true,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'sensitive', sensitive: true }],
    actions: [{ type: 'highlight', color: '#9C27B0', isDashed: false }],
    createSelectors: () => [createSensitiveNodeSelector()],
  }),
  defineFilter({
    id: 'node-types-filter',
    name: 'Types',
    description: 'Filter nodes by the roles and file types present in this graph',
    kind: 'group',
    enabled: false,
    applicable: false,
    actions: [],
    children: nodeTypeChildren,
    presentation: { control: 'node-types' },
  }),
  defineFilter({
    id: 'folder-filter',
    name: 'Folders',
    description: 'Filter pages by their folder in the source graph',
    kind: 'group',
    enabled: false,
    applicable: false,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'folder' }],
    actions: [],
    parameters: [{
      name: 'path',
      type: 'string',
      required: true,
      description: 'A source-graph folder path; an empty path means the root folder.',
    }],
    presentation: { control: 'folders' },
  }),
  defineFilter({
    id: 'blacklisted-filter',
    name: 'Blacklisted',
    description: 'Tracked pages that are not published to the bundle. Also, their directly-owned children are removed from the graph',
    kind: 'filter',
    enabled: false,
    applicable: true,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'tracking', listType: 'blacklist' }],
    actions: [{ type: 'highlight', color: '#F44336', isDashed: false }],
    createSelectors: () => [createBlacklistedNodeSelector()],
  }),
  defineFilter({
    id: 'overrides-filter',
    name: 'Depth Override',
    description: 'Inherited depth is overridden',
    kind: 'filter',
    enabled: false,
    applicable: true,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'depthOverride' }],
    actions: [{ type: 'highlight', color: '#33FFF9', isDashed: false }],
    createSelectors: () => [createNodeWithOverrideSelector()],
  }),
  defineFilter({
    id: 'gap-filter',
    name: 'Gap',
    description: 'Find nodes whose source-graph links are missing from the working graph',
    kind: 'group',
    enabled: false,
    applicable: false,
    actions: [],
    children: [outlinkGapFilter, inlinkGapFilter],
    presentation: { control: 'gap' },
  }),
  defineFilter({
    id: 'frontier-filter',
    name: 'Frontier',
    description: 'Show me what is beyond the graph!',
    kind: 'filter',
    enabled: false,
    applicable: true,
    selectorApplicationCriteria: 'union',
    selectors: [{ type: 'frontier' }],
    actions: [{ type: 'highlight', color: '#FF69B4', isDashed: false }],
    createSelectors: () => [createFrontierNodeSelector()],
    presentation: {
      cannotHide: true,
      showThresholdInput: true,
      thresholdValue: 1,
      thresholdLabel: 'Depth:',
      thresholdMax: 10,
    },
  }),
];

export function flattenBuiltInGraphFilterDefinitions(): BuiltInGraphFilterDefinition[] {
  const flattened: BuiltInGraphFilterDefinition[] = [];
  const visit = (definitions: readonly BuiltInGraphFilterDefinition[]): void => {
    for (const definition of definitions) {
      flattened.push(definition);
      visit(definition.children);
    }
  };
  visit(BUILT_IN_GRAPH_FILTER_DEFINITIONS);
  return flattened;
}

export function frontendBuiltInGraphFilterDefinitions(): BuiltInGraphFilterDefinition[] {
  return flattenBuiltInGraphFilterDefinitions()
    .filter(definition => definition.presentation?.includeInFrontend !== false);
}
