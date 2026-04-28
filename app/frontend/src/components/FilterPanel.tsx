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

import React, { useState } from 'react';
/* eslint-disable react/prop-types */
import { IFilter } from '../types/filters';
import { createSearchByTitleSelector, createOutlinkDiscrepancySelector, createInlinkDiscrepancySelector } from '../types/filters';
import { useDebounce } from '../hooks/useDebounce';
import CustomFilterModal from './CustomFilterModal';
import { CustomFilterConfig } from '../../../shared_code/types/customFilters';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';

const SEARCH_HIGHLIGHT_ACTION = { type: 'highlight' as const, color: '#009688', isDashed: false };

interface FilterPanelProps {
  filters: IFilter[];
  onFilterChange: (filterId: string, changes: Partial<IFilter>) => void;
  siteSlug: string;
  onCustomFiltersChange?: () => void;
  untrackedPagesCount?: number;
}

const FilterPanel = React.memo<FilterPanelProps>(({
  filters,
  onFilterChange,
  siteSlug,
  onCustomFiltersChange,
  untrackedPagesCount,
}) => {

  
  // Custom filter modal state
  const [isCustomFilterModalOpen, setIsCustomFilterModalOpen] = useState(false);
  const [editingCustomFilter, setEditingCustomFilter] = useState<CustomFilterConfig | null>(null);

  // Hover state for the entire filter panel (to show/hide hint icons)
  const [isPanelHovered, setIsPanelHovered] = useState(false);

  // Local state for immediate UI updates for search inputs
  const [searchInputs, setSearchInputs] = useState<Record<string, string>>({});

  // Local state for threshold inputs
  const [thresholdInputs, setThresholdInputs] = useState<Record<string, number>>({});

  const debouncedSearchInputs = useDebounce(searchInputs, 150);
  const debouncedThresholdInputs = useDebounce(thresholdInputs, 300);
  
  // Track whether search had content before (to detect 0 -> >0 transitions)
  const [searchHadContent, setSearchHadContent] = React.useState(false);

  // Get search filter reference early (needed by text labels logic)
  const searchFilter = filters.find(f => f.id === 'search-by-title-filter');

  // Text labels toggle - persisted in session storage, default enabled
  const [showTextLabels, setShowTextLabels] = useState(() => {
    return sessionStorage.getItem('searchShowTextLabels') !== 'false';
  });

  // Sync text labels to filter actions on mount if session says disabled
  const textLabelsInitialized = React.useRef(false);
  React.useEffect(() => {
    if (!textLabelsInitialized.current && searchFilter) {
      textLabelsInitialized.current = true;
      if (!showTextLabels) {
        onFilterChange(searchFilter.id, { actions: [SEARCH_HIGHLIGHT_ACTION] });
      }
    }
  }, [searchFilter, showTextLabels, onFilterChange]);

  const handleToggleTextLabels = () => {
    const newValue = !showTextLabels;
    setShowTextLabels(newValue);
    sessionStorage.setItem('searchShowTextLabels', String(newValue));
    if (searchFilter) {
      onFilterChange(searchFilter.id, {
        actions: newValue
          ? [SEARCH_HIGHLIGHT_ACTION, { type: 'show_titles' }]
          : [SEARCH_HIGHLIGHT_ACTION]
      });
    }
  };

  // Apply debounced search changes
  React.useEffect(() => {
    Object.entries(debouncedSearchInputs).forEach(([filterId, searchValue]) => {
      const filter = filters.find(f => f.id === filterId);
      if (filter && filter.id === 'search-by-title-filter') {
        const currentSearchInput = filter.pageSelectors[0]?.searchInput || '';

        // Only update if the debounced value differs from current filter value
        if (searchValue !== currentSearchInput) {
          // Auto-enable Solo when going from 0 to >0 characters
          const isNewSearch = !searchHadContent && searchValue.length > 0;

          onFilterChange(filter.id, {
            pageSelectors: [createSearchByTitleSelector(searchValue)],
            ...(isNewSearch ? { isSolo: true } : {}),
            // When clearing search, also turn off Solo and Hide
            ...(searchValue.length === 0 ? { isSolo: false, isHidden: false } : {})
          });

          // Track whether search has content
          setSearchHadContent(searchValue.length > 0);
        }
      }
    });
  }, [debouncedSearchInputs, filters, onFilterChange, searchHadContent]);

  // Apply debounced threshold changes
  React.useEffect(() => {
    Object.entries(debouncedThresholdInputs).forEach(([filterId, thresholdValue]) => {
      const filter = filters.find(f => f.id === filterId);
      if (filter && filter.showThresholdInput) {
        const currentThreshold = filter.thresholdValue ?? 5;

        // Only update if the debounced value differs from current filter value
        if (thresholdValue !== currentThreshold) {
          // Create the appropriate selector based on filter id
          let newSelector;
          if (filterId === 'outlink-gap-filter') {
            newSelector = createOutlinkDiscrepancySelector(thresholdValue);
          } else if (filterId === 'inlink-gap-filter') {
            newSelector = createInlinkDiscrepancySelector(thresholdValue);
          }

          if (newSelector) {
            // Persist both the selector and the thresholdValue on the filter
            onFilterChange(filter.id, { pageSelectors: [newSelector], thresholdValue });
          } else if (filterId === 'frontier-filter') {
            // Frontier threshold only affects the API call, not the page selector
            onFilterChange(filter.id, { thresholdValue });
          }
        }
      }
    });
  }, [debouncedThresholdInputs, filters, onFilterChange]);

  // Initialize search inputs from filter state (only for filters not yet in local state)
  React.useEffect(() => {
    setSearchInputs(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      filters.forEach(filter => {
        if (filter.showSearchInput && filter.pageSelectors.length > 0) {
          // Only initialize if not already set in local state - don't overwrite user input
          if (!(filter.id in prev)) {
            updated[filter.id] = filter.pageSelectors[0]?.searchInput || '';
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [filters]);

  // Sync local threshold inputs when filter thresholdValue changes externally (e.g. auto-calculation)
  React.useEffect(() => {
    setThresholdInputs(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      // Clear local overrides that now match the filter's threshold value,
      // so the input falls back to showing filter.thresholdValue directly
      Object.keys(prev).forEach(filterId => {
        const filter = filters.find(f => f.id === filterId);
        if (filter && filter.showThresholdInput) {
          const filterThreshold = filter.thresholdValue ?? 5;
          if (prev[filterId] === filterThreshold) {
            delete updated[filterId];
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [filters]);

  // Custom filter handlers
  const handleCreateCustomFilter = () => {
    setEditingCustomFilter(null);
    setIsCustomFilterModalOpen(true);
  };

  const handleEditCustomFilter = async (filterId: string) => {
    try {
      // Extract the custom filter ID from the IFilter ID
      const customFilterId = filterId.replace('custom-', '');
      
      // Load the custom filter config
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/custom-filters`);
      if (response.ok) {
        const data = await response.json();
        const customFilter = data.filters.find((f: CustomFilterConfig) => f.id === customFilterId);
        if (customFilter) {
          setEditingCustomFilter(customFilter);
          setIsCustomFilterModalOpen(true);
        }
      }
    } catch (error) {
      logger.error('Error loading custom filter for editing:', error);
    }
  };

  const handleFilterEnabledChange = async (filter: IFilter, newEnabledState: boolean) => {
    // For global filters, persist the disabled state to site.yaml
    if (filter.id.startsWith('custom-') && filter.scope === 'global') {
      try {
        const customFilterId = filter.id.replace('custom-', '');
        const disabled = !newEnabledState;
        
        const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/disabled-global-filters/${customFilterId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabled })
        });
        
        if (response.ok) {
          // Also update the immediate UI state
          onFilterChange(filter.id, { enabled: newEnabledState });
        } else {
          logger.error('Failed to persist global filter disabled state');
        }
      } catch (error) {
        logger.error('Error persisting global filter disabled state:', error);
      }
    } else {
      // For non-global filters, just update the immediate state
      onFilterChange(filter.id, { enabled: newEnabledState });
    }
  };



  const handleCustomFilterSave = () => {
    setIsCustomFilterModalOpen(false);
    setEditingCustomFilter(null);
    if (onCustomFiltersChange) {
      onCustomFiltersChange();
    }
  };

  const otherFilters = filters.filter(f => !f.hideFromFilterList && f.id !== 'search-by-title-filter');
  const searchText = searchInputs['search-by-title-filter'] || '';
  const hasSearchText = searchText.length > 0;

  const handleClearSearch = () => {
    setSearchInputs(prev => ({
      ...prev,
      ['search-by-title-filter']: ''
    }));
    setSearchHadContent(false);
  };

  return (
    <div
      className="flex flex-col space-y-4"
      onMouseEnter={() => setIsPanelHovered(true)}
      onMouseLeave={() => setIsPanelHovered(false)}
    >
      {/* Filter List */}
      <div className="p-4 bg-white border rounded-lg">
        {/* Search Filter - Always visible */}
        {searchFilter && (
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSearchInputs(prev => ({
                      ...prev,
                      ['search-by-title-filter']: newValue
                    }));
                  }}
                  placeholder="Search"
                  className="w-full px-2 py-1 pr-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {hasSearchText && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              {hasSearchText && (
                <div className="flex space-x-1">
                  <button
                    onClick={handleToggleTextLabels}
                    className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                      showTextLabels
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title="Show text labels"
                  >
                    T
                  </button>
                  <button
                    onClick={() => onFilterChange(searchFilter.id, { isSolo: !searchFilter.isSolo })}
                    className={`w-6 h-6 flex items-center justify-center rounded ${
                      searchFilter.isSolo
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title="Solo"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="8" r="4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onFilterChange(searchFilter.id, { isHidden: !searchFilter.isHidden })}
                    className={`w-6 h-6 flex items-center justify-center rounded ${
                      searchFilter.isHidden
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title="Hide"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
                      <circle cx="10" cy="10" r="2.5" />
                      <path d="M3 17L17 3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end mb-4">
          <button
            onClick={handleCreateCustomFilter}
            className="w-6 h-6 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex items-center justify-center"
            title="Add custom filter"
          >
            +
          </button>
        </div>
        <div className="space-y-3">
          {otherFilters.map((filter) => {
            const threshold = thresholdInputs[filter.id] ?? filter.thresholdValue ?? 5;
            const gapDescription = filter.id === 'outlink-gap-filter'
              ? `Pages with ${threshold} or more outlinks that do not show in the graph`
              : filter.id === 'inlink-gap-filter'
              ? `Pages with ${threshold} or more inlinks that do not show in the graph`
              : null;
            const tooltipDescription = filter.descriptionNode || gapDescription || filter.description;
            return (
            <div
              key={filter.id}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    id={`${filter.id}-enabled`}
                    checked={filter.enabled}
                    onChange={(e) => handleFilterEnabledChange(filter, e.target.checked)}
                    className={`form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 flex-shrink-0 transition-opacity duration-200 ${!filter.enabled ? 'opacity-50' : ''}`}
                  />
                  <label htmlFor={`${filter.id}-enabled`} className={`text-sm text-gray-700 flex items-center min-w-0 transition-opacity duration-200 ${!filter.enabled ? 'opacity-50' : ''}`}>
                    <span className="truncate">{filter.name}</span>
                    {filter.id === 'untracked-filter' && untrackedPagesCount !== undefined && untrackedPagesCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs font-medium bg-warning-100 text-warning-700 rounded flex-shrink-0">
                        {untrackedPagesCount}
                      </span>
                    )}
                  </label>
                  {tooltipDescription && (
                    <span className="relative ml-1 group cursor-default">
                      <span className={`w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-gray-400 text-gray-500 text-[10px] -translate-y-0.5 transition-opacity duration-[125ms] ${isPanelHovered ? (filter.enabled ? 'opacity-100' : 'opacity-50') : 'opacity-0'}`}>
                        ?
                      </span>
                      <span className="fixed ml-2 w-64 p-2 bg-white text-gray-700 text-xs rounded border border-gray-200 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-[9999]">
                        {tooltipDescription}
                      </span>
                    </span>
                  )}
                </div>
                {filter.enabled && (
                  <div className="flex space-x-1 flex-shrink-0 ml-2">
                    {filter.id.startsWith('custom-') && (
                      <button
                        onClick={() => handleEditCustomFilter(filter.id)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        title="Edit"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                        </svg>
                      </button>
                    )}
                    {(() => {
                      const hasShowTitles = filter.actions.some(a => a.type === 'show_titles');
                      return (
                        <button
                          onClick={() => {
                            const newActions = hasShowTitles
                              ? filter.actions.filter(a => a.type !== 'show_titles')
                              : [...filter.actions, { type: 'show_titles' as const }];
                            onFilterChange(filter.id, { actions: newActions });
                          }}
                          className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                            hasShowTitles
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                          }`}
                          title="Show text labels"
                        >
                          T
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => onFilterChange(filter.id, { isSolo: !filter.isSolo })}
                      className={`w-6 h-6 flex items-center justify-center rounded ${
                        filter.isSolo
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                      }`}
                      title="Solo"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="8" r="4" />
                      </svg>
                    </button>
                    {!filter.cannotHide && (
                      <button
                        onClick={() => onFilterChange(filter.id, { isHidden: !filter.isHidden })}
                        className={`w-6 h-6 flex items-center justify-center rounded ${
                          filter.isHidden
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                        }`}
                        title="Hide"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
                          <circle cx="10" cy="10" r="2.5" />
                          <path d="M3 17L17 3" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {filter.enabled && filter.showSearchInput &&
                filter.pageSelectors.length > 0 && (
                <div className="ml-6">
                  <input
                    type="text"
                    value={searchInputs[filter.id] || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setSearchInputs(prev => ({
                        ...prev,
                        [filter.id]: newValue
                      }));
                    }}
                    placeholder="Type to search titles..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
              {filter.enabled && filter.showThresholdInput &&
                filter.pageSelectors.length > 0 && (
                <div className="ml-6 flex items-center space-x-2">
                  <label className="text-xs text-gray-500">{filter.thresholdLabel ?? 'Gap \u2265:'}</label>
                  <input
                    type="number"
                    min="1"
                    max={filter.thresholdMax}
                    value={thresholdInputs[filter.id] ?? filter.thresholdValue ?? 5}
                    onChange={(e) => {
                      let newValue = Math.max(1, parseInt(e.target.value) || 1);
                      if (filter.thresholdMax) newValue = Math.min(filter.thresholdMax, newValue);
                      setThresholdInputs(prev => ({
                        ...prev,
                        [filter.id]: newValue
                      }));
                    }}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
              {filter.enabled && (() => {
                const highlightAction = filter.actions.find(a => a.type === 'highlight');
                const sensitiveAction = filter.actions.find(a => a.type === 'mark_sensitive');
                const showLabelsAction = filter.actions.find(a => a.type === 'show_labels');
                return (
                  <>
                    {(highlightAction || sensitiveAction) && (
                      <div className="ml-6 flex items-center space-x-2 text-xs text-gray-500">
                        {highlightAction && highlightAction.type === 'highlight' && (
                          <svg className="w-4 h-4" viewBox="0 0 16 16">
                            <circle
                              cx="8"
                              cy="8"
                              r="5.5"
                              fill="none"
                              stroke={highlightAction.color}
                              strokeWidth="2"
                              strokeDasharray={highlightAction.isDashed ? '2 2' : 'none'}
                            />
                          </svg>
                        )}
                        {sensitiveAction && (
                          <>
                            <span className="font-bold">+</span>
                            <span>sensitive</span>
                          </>
                        )}
                      </div>
                    )}
                    {showLabelsAction && (
                      <div className="ml-6 flex items-center space-x-2 text-xs text-gray-500">
                        <span>Shows page labels when active</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
          })}
        </div>
      </div>

      {/* Custom Filter Modal */}
      <CustomFilterModal
        isOpen={isCustomFilterModalOpen}
        onClose={() => setIsCustomFilterModalOpen(false)}
        onSave={handleCustomFilterSave}
        onDelete={handleCustomFilterSave}
        siteSlug={siteSlug}
        existingFilter={editingCustomFilter}
      />
    </div>
  );
});

FilterPanel.displayName = 'FilterPanel';

export default FilterPanel; 