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

import { apiRequest } from '../../../../shared/utils/apiClient';
import React, { useEffect, useState } from 'react';
import { CustomFilterConfig } from '../../../../../../shared_code/types/customFilters.js';
import type {
  BuiltInGraphFilterAction,
  NodeTypeFilterId,
} from '../../../../../../shared_code/types/graphInspection.js';
import {
  frontendBuiltInGraphFilterDefinitions,
  type BuiltInGraphFilterDefinition,
} from '../../../../../../shared_code/utils/builtInGraphFilters.js';
import { logger } from '../../../../shared/utils/logger';

export type { NodeTypeFilterId } from '../../../../../../shared_code/types/graphInspection.js';

// Re-export filter selector types and functions from local utils
export type { SelectorBase, INormalBundleNodeSelector, IBundleNodeSelector } from '../utils/filterSelectors';
export {
  createTrackedNodeSelector,
  createUntrackedNodeSelector,
  createBlacklistedNodeSelector,
  createSensitiveNodeSelector,
  createFrontierNodeSelector,
  createFolderNodeSelector,
  createBundleNodeKindSelector,
  createFileTypeNodeSelector,
  createSelectedScopeRootSelector,
  createSearchByTitleSelector,
  createNodeWithOverrideSelector,
  createOutlinkDiscrepancySelector,
  createInlinkDiscrepancySelector,
  createCustomBundleNodeSelector as createCustomBundleNodeSelectorBase,
  calculateOptimalGapThreshold
} from '../utils/filterSelectors';

import {
  INormalBundleNodeSelector,
  IBundleNodeSelector,
  createCustomBundleNodeSelector as createCustomBundleNodeSelectorBase
} from '../utils/filterSelectors';
import type { CustomBundleNodeSelectorConfig } from '../../../../../../shared_code/types/customFilters.js';

export type FilterAction = BuiltInGraphFilterAction;

export interface IFolderFilterState {
  showTitles: boolean;
  isSolo: boolean;
  isHidden: boolean;
}

export type INodeTypeFilterState = IFolderFilterState;

export interface IFilter {
  id: string;
  name: string;
  bundleNodeSelectors: IBundleNodeSelector[];
  selectorApplicationCriteria: 'union' | 'intersection';
  actions: FilterAction[];
  enabled: boolean;
  isSolo: boolean;
  isHidden: boolean;
  showSearchInput?: boolean; // Whether to show search input in UI
  showThresholdInput?: boolean; // Whether to show threshold input in UI for discrepancy filters
  thresholdValue?: number; // Current threshold value for discrepancy filters (persists across graph changes)
  thresholdLabel?: string; // Label for the threshold input (defaults to "Gap ≥:")
  thresholdMax?: number; // Maximum value for the threshold input
  scope?: 'global' | 'bundle'; // Scope of custom filters
  hideFromFilterList?: boolean; // Whether to hide this filter from the UI filter list
  cannotHide?: boolean; // If true, the Hide button is disabled for this filter
  description?: string; // Tooltip description shown on hover
  descriptionNode?: React.ReactNode; // Rich tooltip content (takes precedence over description)
  isFolderFilter?: boolean; // Whether this built-in filter renders the folder tree UI
  folderStates?: Record<string, IFolderFilterState>; // Per-folder title, solo, and hide state
  isNodeTypeFilter?: boolean; // Whether this built-in filter renders the graph type list UI
  nodeTypeStates?: Partial<Record<NodeTypeFilterId, INodeTypeFilterState>>; // Per-type title, solo, and hide state
  isGapFilter?: boolean; // Whether this built-in filter renders the grouped inlink/outlink gap UI
}

export interface IFilterState {
  filters: IFilter[];
  soloedFilters: Set<string>;
  hiddenFilters: Set<string>;
}

// Wrapper for createCustomBundleNodeSelector that uses the frontend logger
export const createCustomBundleNodeSelector = (config: CustomBundleNodeSelectorConfig): INormalBundleNodeSelector => {
  return createCustomBundleNodeSelectorBase(config, (msg, error) => logger.warn(msg, error));
};

// Convert custom filter config to IFilter
export const customFilterToIFilter = (customFilter: CustomFilterConfig): IFilter => {
  const bundleNodeSelectors = customFilter.selectors.map(createCustomBundleNodeSelector);
  
  const actions = customFilter.actions.map(action => {
    switch (action.type) {
      case 'highlight':
        return {
          type: 'highlight' as const,
          color: action.color || '#FFD700',
          isDashed: action.isDashed || false
        };
      case 'mark_sensitive':
        return { type: 'mark_sensitive' as const };
      default:
        return { type: 'highlight' as const, color: '#FFD700', isDashed: false };
    }
  });
  
  return {
    id: `custom-${customFilter.id}`,
    name: customFilter.name,
    bundleNodeSelectors,
    selectorApplicationCriteria: customFilter.selectorApplicationCriteria,
    actions,
    enabled: customFilter.enabled,
    isSolo: false,
    isHidden: false,
    scope: customFilter.scope,
    ...(customFilter.note ? { description: customFilter.note } : {})
  };
};

function builtInDefinitionToIFilter(definition: BuiltInGraphFilterDefinition): IFilter {
  const { descriptor, presentation = {} } = definition;
  const { includeInFrontend, control, ...presentationOptions } = presentation;
  void includeInFrontend;
  return {
    id: descriptor.id,
    name: descriptor.name,
    description: descriptor.description,
    bundleNodeSelectors: definition.createSelectors?.() ?? [],
    selectorApplicationCriteria: descriptor.selectorApplicationCriteria ?? 'union',
    actions: descriptor.actions.map(action => ({ ...action })),
    enabled: descriptor.enabled,
    isSolo: false,
    isHidden: false,
    ...presentationOptions,
    ...(control === 'node-types' ? { isNodeTypeFilter: true, nodeTypeStates: {} } : {}),
    ...(control === 'folders' ? { isFolderFilter: true, folderStates: {} } : {}),
    ...(control === 'gap' ? { isGapFilter: true } : {}),
  };
}

function createBuiltInFilters(): IFilter[] {
  return frontendBuiltInGraphFilterDefinitions().map(builtInDefinitionToIFilter);
}

// --- Custom hook for filter state ---
export function useFilterState(bundleSlug: string): [IFilter[], React.Dispatch<React.SetStateAction<IFilter[]>>, () => void] {
  const [customFilters, setCustomFilters] = useState<CustomFilterConfig[]>([]);

  // Load custom filters function - extracted so it can be called on demand
  const loadCustomFilters = React.useCallback(async () => {
    if (!bundleSlug) return;
    try {
      const response = await apiRequest(`bundles/${bundleSlug}/curation/custom-filters`);
      if (response.ok) {
        const data = await response.json();
        setCustomFilters(data.filters || []);
      }
    } catch (error) {
      logger.warn('Error loading custom filters:', error);
    }
  }, [bundleSlug]);

  // Load custom filters on mount and when bundleSlug changes
  useEffect(() => {
    loadCustomFilters();
  }, [loadCustomFilters]);
  
  const [filters, setFilters] = useState<IFilter[]>(createBuiltInFilters);

  // Add custom filters to the main filters list
  useEffect(() => {
    setFilters(prev => {
      // Get non-custom filters (built-in filters)
      const builtInFilters = prev.filter(f => !f.id.startsWith('custom-'));
      
      // Convert custom filter configs to IFilter objects
      const customIFilters = customFilters.map(customFilterToIFilter);
      
      return [...builtInFilters, ...customIFilters];
    });
  }, [customFilters]);

  return [filters, setFilters, loadCustomFilters];
}
