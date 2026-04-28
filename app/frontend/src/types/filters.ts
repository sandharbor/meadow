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

import { API_BASE_URL } from '../utils/apiConfig';
import React, { useEffect, useState } from 'react';
import { CustomFilterConfig } from '../../../shared_code/types/customFilters.js';
import { logger } from '../utils/logger';

// Re-export filter selector types and functions from local utils
export type { SelectorBase, INormalPageSelector, IPageSelector } from '../utils/filterSelectors';
export {
  createTrackedPageSelector,
  createUntrackedPageSelector,
  createBlacklistedPageSelector,
  createSensitivePageSelector,
  createFrontierPageSelector,
  createSearchByTitleSelector,
  createPageWithOverrideSelector,
  createOutlinkDiscrepancySelector,
  createInlinkDiscrepancySelector,
  createCustomPageSelector as createCustomPageSelectorBase,
  calculateOptimalGapThreshold
} from '../utils/filterSelectors';

import {
  INormalPageSelector,
  IPageSelector,
  createUntrackedPageSelector,
  createBlacklistedPageSelector,
  createSensitivePageSelector,
  createSearchByTitleSelector,
  createPageWithOverrideSelector,
  createOutlinkDiscrepancySelector,
  createInlinkDiscrepancySelector,
  createFrontierPageSelector,
  createCustomPageSelector as createCustomPageSelectorBase
} from '../utils/filterSelectors';
import type { CustomPageSelectorConfig } from '../../../shared_code/types/customFilters.js';

export interface IHighlightAction {
  type: 'highlight';
  color: string;
  isDashed: boolean;
}

export interface IShowLabelsAction {
  type: 'show_labels';
}

export interface IShowTitlesAction {
  type: 'show_titles';
}

export interface IMarkSensitiveAction {
  type: 'mark_sensitive';
}

export type FilterAction = IHighlightAction | IShowLabelsAction | IShowTitlesAction | IMarkSensitiveAction;

export interface IFilter {
  id: string;
  name: string;
  pageSelectors: IPageSelector[];
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
  scope?: 'global' | 'site'; // Scope of custom filters
  hideFromFilterList?: boolean; // Whether to hide this filter from the UI filter list
  cannotHide?: boolean; // If true, the Hide button is disabled for this filter
  description?: string; // Tooltip description shown on hover
  descriptionNode?: React.ReactNode; // Rich tooltip content (takes precedence over description)
}

export interface IFilterState {
  filters: IFilter[];
  soloedFilters: Set<string>;
  hiddenFilters: Set<string>;
}

// Wrapper for createCustomPageSelector that uses the frontend logger
export const createCustomPageSelector = (config: CustomPageSelectorConfig): INormalPageSelector => {
  return createCustomPageSelectorBase(config, (msg, error) => logger.warn(msg, error));
};

// Convert custom filter config to IFilter
export const customFilterToIFilter = (customFilter: CustomFilterConfig): IFilter => {
  const pageSelectors = customFilter.selectors.map(createCustomPageSelector);
  
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
    pageSelectors,
    selectorApplicationCriteria: customFilter.selectorApplicationCriteria,
    actions,
    enabled: customFilter.enabled,
    isSolo: false,
    isHidden: false,
    scope: customFilter.scope,
    ...(customFilter.note ? { description: customFilter.note } : {})
  };
};

// --- Custom hook for filter state ---
export function useFilterState(siteSlug: string): [IFilter[], React.Dispatch<React.SetStateAction<IFilter[]>>, () => void] {
  const [customFilters, setCustomFilters] = useState<CustomFilterConfig[]>([]);

  // Load custom filters function - extracted so it can be called on demand
  const loadCustomFilters = React.useCallback(async () => {
    if (!siteSlug) return;
    try {
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/custom-filters`);
      if (response.ok) {
        const data = await response.json();
        setCustomFilters(data.filters || []);
      }
    } catch (error) {
      logger.warn('Error loading custom filters:', error);
    }
  }, [siteSlug]);

  // Load custom filters on mount and when siteSlug changes
  useEffect(() => {
    loadCustomFilters();
  }, [loadCustomFilters]);
  
  const [filters, setFilters] = useState<IFilter[]>(() => [
    {
      id: 'search-by-title-filter',
      name: 'Search By Title',
      pageSelectors: [createSearchByTitleSelector()],
      selectorApplicationCriteria: 'union',
      actions: [
        { type: 'highlight', color: '#009688', isDashed: false },
        { type: 'show_titles' }
      ],
      enabled: true, // Always enabled - search input is always visible
      isSolo: false,
      isHidden: false,
      showSearchInput: true
    },
    {
      id: 'untracked-filter',
      name: 'Untracked',
      description: 'Pages not yet tracked for publishing. New source pages appear here after they are added to the source directory',
      pageSelectors: [createUntrackedPageSelector()],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#2196F3', isDashed: true }],
      enabled: false,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'sensitive-filter',
      name: 'Sensitive',
      description: 'Pages with meadow-sensitive: true property in the source page. Sensitive pages are automatically excluded from bulk tracking',
      descriptionNode: React.createElement(React.Fragment, null,
        'Pages with ',
        React.createElement('code', { className: 'bg-gray-100 px-1 py-0.5 rounded text-xs' }, 'meadow-sensitive: true'),
        ' property in the source page. Sensitive pages are automatically excluded from bulk tracking'
      ),
      pageSelectors: [createSensitivePageSelector()],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#9C27B0', isDashed: false }],
      enabled: true,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'blacklisted-filter',
      name: 'Blacklisted',
      description: 'Tracked pages that are not published to the site. Also, their directly-owned children are removed from the graph',
      descriptionNode: React.createElement(React.Fragment, null,
        'Tracked pages that are ',
        React.createElement('strong', null, 'not'),
        ' published to the site. Also, their directly-owned children are removed from the graph'
      ),
      pageSelectors: [createBlacklistedPageSelector()],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#F44336', isDashed: false }],
      enabled: false,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'overrides-filter',
      name: 'Depth Override',
      description: 'Inherited depth is overridden',
      pageSelectors: [createPageWithOverrideSelector()],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#33FFF9', isDashed: false }],
      enabled: false,
      isSolo: false,
      isHidden: false
    },
    {
      id: 'outlink-gap-filter',
      name: 'Outlink Gap',
      pageSelectors: [createOutlinkDiscrepancySelector(5)],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#CDDC39', isDashed: false }],
      enabled: false,
      isSolo: false,
      isHidden: false,
      showThresholdInput: true,
      thresholdValue: 5
    },
    {
      id: 'inlink-gap-filter',
      name: 'Inlink Gap',
      pageSelectors: [createInlinkDiscrepancySelector(5)],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#E91E63', isDashed: false }],
      enabled: false,
      isSolo: false,
      isHidden: false,
      showThresholdInput: true,
      thresholdValue: 5
    },
    {
      id: 'frontier-filter',
      name: 'Frontier',
      description: 'Show me what is beyond the graph!',
      pageSelectors: [createFrontierPageSelector()],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#FF69B4', isDashed: false }],
      enabled: false,
      isSolo: false,
      isHidden: false,
      cannotHide: true,
      showThresholdInput: true,
      thresholdValue: 1,
      thresholdLabel: 'Depth:',
      thresholdMax: 10
    }
  ]);

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