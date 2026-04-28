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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Graph, IPage } from '../../../shared_code/types/graph';
import { IFilter, IPageSelector, calculateOptimalGapThreshold, createOutlinkDiscrepancySelector, createInlinkDiscrepancySelector } from '../types/filters';
import { DisplayGraph } from '../types/displayGraph';
import GraphVis from './GraphVis';
import ListView from './ListView';
import FilterPanel from './FilterPanel';
import SitePageSelectionSidebar from './SitePageSelectionSidebar';
import SitePageTabsDropdown from './SitePageTabsDropdown';
import PageContextMenu, { ObsidianInfo } from './PageContextMenu';
import EmptySoloCallout from './EmptySoloCallout';
import SitePagesToggle from './SitePagesToggle';
import { SitePageConfig } from '../../../shared_code/types/sitePageConfig';
import { API_BASE_URL } from '../utils/apiConfig';
import { buildPageConfigs } from '../../../shared_code/utils/sitePageConfigUtils';
import Modal from './Modal';
import { AppConfig } from '../../../shared_code/types/appConfig';
import { logger } from '../utils/logger';

interface SitePageTabsProps {
  graph: Graph;
  initialPageId?: string;
  filters: IFilter[];
  onFiltersChange: React.Dispatch<React.SetStateAction<IFilter[]>>;
  onReloadCustomFilters?: () => void;
  onConfigChange?: () => void;
  onCheckDraftStatus?: () => void;
  onAutoSave?: () => Promise<void> | void;
  isSelectionPanelCollapsed: boolean;
  onSelectionPanelCollapseChange: (collapsed: boolean) => void;
  selectedPages: Set<string>;
  onSelectedPagesChange: (pages: Set<string>) => void;
  onPreviewPage: (pageId: string) => void;
  hasDraftChanges: boolean;
  siteSlug: string;
  onRefresh: () => void;
  untrackedPagesCount: number;
  graphUpdateTrigger: number;
}

type ViewType = 'graph' | 'list';

// Create a page selector that selects specific pages by ID
const createPageIdSelector = (pageIds: Set<string>, name: string): IPageSelector => ({
  id: `page-id-selector-${name}`,
  name: name,
  type: 'normal',
  select: () => new Set(pageIds)
});

const SitePageTabs: React.FC<SitePageTabsProps> = ({
  graph,
  initialPageId,
  filters,
  onFiltersChange,
  onReloadCustomFilters,
  onConfigChange,
  onCheckDraftStatus,
  onAutoSave,
  isSelectionPanelCollapsed,
  onSelectionPanelCollapseChange,
  selectedPages,
  onSelectedPagesChange,
  onPreviewPage,
  hasDraftChanges,
  siteSlug,
  onRefresh,
  untrackedPagesCount,
  graphUpdateTrigger,
}) => {
  const [activeView, setActiveView] = useState<ViewType>(() => {
    return (sessionStorage.getItem('graphActiveView') as ViewType) || 'graph';
  });

  // State for selection solo and hide features
  const [hiddenPages, setHiddenPages] = useState<Set<string>>(new Set());
  const [soloPages, setSoloPages] = useState<Set<string>>(new Set());
  const [selectionShowTitles, setSelectionShowTitles] = useState(false);

  // State for right-click context menu on pages
  const [contextMenuPage, setContextMenuPage] = useState<{ pageId: string; x: number; y: number } | null>(null);

  // Obsidian info (shared between sidebar and context menu)
  const [obsidianInfo, setObsidianInfo] = useState<ObsidianInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadObsidianInfo = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/sites/${encodeURIComponent(siteSlug)}/obsidian-info`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setObsidianInfo({
            hasObsidianVault: data?.hasObsidianVault === true,
            sourceDirectory: typeof data?.sourceDirectory === 'string' ? data.sourceDirectory : null,
            vaultNameGuess: typeof data?.vaultNameGuess === 'string' ? data.vaultNameGuess : null,
          });
        }
      } catch (err) {
        logger.warn('Failed to load obsidian info:', err);
      }
    };
    if (siteSlug) {
      loadObsidianInfo();
    }
    return () => { cancelled = true; };
  }, [siteSlug]);

  // State for meadow-sensitive consent modal
  const [showSensitiveConsentModal, setShowSensitiveConsentModal] = useState(false);
  const [pendingSensitiveOperation, setPendingSensitiveOperation] = useState<{
    pageId: string;
    isSensitive: boolean;
  } | null>(null);
  const [hasSensitiveConsent, setHasSensitiveConsent] = useState<boolean | null>(null);

  // Check if user has already consented to adding meadow-sensitive property
  useEffect(() => {
    const checkConsent = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/app-config`);
        if (response.ok) {
          const config: AppConfig = await response.json();
          setHasSensitiveConsent(
            config.calloutDismissals?.allowAddMeadowSensitivePropertyToSourcePages === true
          );
        }
      } catch (error) {
        logger.error('Error checking sensitive consent:', error);
        setHasSensitiveConsent(false);
      }
    };
    checkConsent();
  }, []);

  // Track which graph we've already calculated thresholds for
  const lastCalculatedGraphRef = useRef<string | null>(null);

  // Auto-calculate optimal gap thresholds when graph changes
  useEffect(() => {
    // Create a simple identifier for the graph based on its pages
    const graphId = `${graph.getAllPages().length}-${siteSlug}`;

    // Only calculate once per graph
    if (lastCalculatedGraphRef.current === graphId) {
      return;
    }
    lastCalculatedGraphRef.current = graphId;

    // Calculate optimal thresholds
    const outlinkThreshold = calculateOptimalGapThreshold(graph, 'outlink', 1);
    const inlinkThreshold = calculateOptimalGapThreshold(graph, 'inlink', 1);

    // Update the gap filters with calculated thresholds
    onFiltersChange(prevFilters => prevFilters.map(filter => {
      if (filter.id === 'outlink-gap-filter') {
        return {
          ...filter,
          pageSelectors: [createOutlinkDiscrepancySelector(outlinkThreshold)],
          thresholdValue: outlinkThreshold
        };
      }
      if (filter.id === 'inlink-gap-filter') {
        return {
          ...filter,
          pageSelectors: [createInlinkDiscrepancySelector(inlinkThreshold)],
          thresholdValue: inlinkThreshold
        };
      }
      return filter;
    }));
  }, [graph, siteSlug, onFiltersChange]);

  // Build combined filters including solo and hide filters
  const combinedFilters = useMemo(() => {
    const result: IFilter[] = [...filters];

    // Add solo filter if pages are being soloed
    if (soloPages.size > 0) {
      result.push({
        id: 'selection-solo-filter',
        name: 'Selection Solo',
        pageSelectors: [createPageIdSelector(soloPages, 'solo-pages')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: true,
        isHidden: false,
        hideFromFilterList: true
      });
    }

    // Add selection titles filter if show titles is active
    if (selectionShowTitles && selectedPages.size > 0) {
      result.push({
        id: 'selection-titles-filter',
        name: 'Selection Titles',
        pageSelectors: [createPageIdSelector(selectedPages, 'title-pages')],
        selectorApplicationCriteria: 'union',
        actions: [
          { type: 'highlight', color: '#fbbf24', isDashed: false },
          { type: 'show_titles' }
        ],
        enabled: true,
        isSolo: false,
        isHidden: false,
        hideFromFilterList: true
      });
    }

    // Add hidden filter if pages are hidden
    if (hiddenPages.size > 0) {
      result.push({
        id: 'selection-hide-filter',
        name: 'Hidden Selection',
        pageSelectors: [createPageIdSelector(hiddenPages, 'hidden-pages')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: false,
        isHidden: true,
        hideFromFilterList: true
      });
    }

    return result;
  }, [filters, soloPages, hiddenPages, selectionShowTitles, selectedPages]);

  // Create and manage the DisplayGraph using useMemo for immediate availability
  const currentDisplayGraph = useMemo(() => {
    const dg = new DisplayGraph(graph);
    dg.setFilters(combinedFilters);
    dg.setSelectedPages(selectedPages);
    if (initialPageId) {
      dg.setInitialPage(initialPageId);
    }
    return dg;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- graphUpdateTrigger forces recompute when graph is mutated in-place
  }, [graph, combinedFilters, selectedPages, initialPageId, graphUpdateTrigger]);

  // When pages are selected, expand the panel
  useEffect(() => {
    if (selectedPages.size > 0) {
      onSelectionPanelCollapseChange(false);
    }
  }, [selectedPages.size, onSelectionPanelCollapseChange]);

  const forceReRender = () => {
    onSelectedPagesChange(new Set(selectedPages));
    onConfigChange?.(); // Notify parent of config change
  };

  const handlePageClick = (pageId: string) => {
    const page = graph.getPage(pageId);
    if (page) {
      if (selectedPages.has(pageId)) {
        const newSelected = new Set(selectedPages);
        newSelected.delete(pageId);
        onSelectedPagesChange(newSelected);
      } else {
        // New selections should float to the top of the selection list
        onSelectedPagesChange(new Set([pageId, ...selectedPages]));
      }
    }
  };

  const handleSelectAllVisible = () => {
    let visiblePages = currentDisplayGraph.visibleDisplayPages;
    if (isSitePagesOnlyToggleActive) {
      visiblePages = visiblePages.filter(page =>
        page.underlyingPage.tracked && !page.underlyingPage.blacklisted && !page.underlyingPage.isFrontierPage
      );
    }
    onSelectedPagesChange(new Set(visiblePages.map(page => page.id)));
  };

  const handleSelectNone = () => {
    onSelectedPagesChange(new Set());
  };

  // Solo selection - show only selected pages
  const handleSoloSelection = () => {
    if (soloPages.size > 0) {
      // If already in solo mode, exit it
      setSoloPages(new Set());
    } else {
      // Enter solo mode with current selection
      setSoloPages(new Set(selectedPages));
    }
  };

  // Hide selection - hide the selected pages
  const handleHideSelection = () => {
    setHiddenPages(prev => {
      const next = new Set(prev);
      selectedPages.forEach(id => next.add(id));
      return next;
    });
    // Clear selection after hiding
    onSelectedPagesChange(new Set());
  };

  // Clear hidden pages
  const handleClearHidden = () => {
    setHiddenPages(new Set());
  };

  // State for "Show Site" solo mode
  const [isSitePagesOnlyToggleActive, setIsSitePagesOnlyToggleActive] = useState(false);
  const [sitePreviewHover, setSitePreviewHover] = useState(false);

  // Check if we're in solo mode
  const isSoloActive = soloPages.size > 0;
  const hasHiddenPages = hiddenPages.size > 0;

  // Check if the view is empty due to active solos
  const hasSoloFilters = combinedFilters.some(f => f.isSolo && f.enabled);
  const isEmptyDueToSolo = currentDisplayGraph.visibleDisplayPages.length === 0 && hasSoloFilters;

  const handleTurnOffSolos = () => {
    // Turn off solo on all filters
    onFiltersChange(prev => prev.map(f => f.isSolo ? { ...f, isSolo: false } : f));
    // Clear selection solo
    setSoloPages(new Set());
  };

  // Handle "Show Only Site Pages" toggle
  const handleSitePagesOnlyToggle = useCallback(() => {
    setIsSitePagesOnlyToggleActive(prev => !prev);
  }, []);

  const ensurePageConfigForPersistence = (page: IPage, listType: 'whitelist' | 'blacklist') => {
    // Ensure conf and conf.config objects exist for persistence
    page.conf = page.conf || { title: page.title, config: { list_type: listType } };
    page.conf.config = page.conf.config || { list_type: listType };
    page.conf.config.list_type = listType;
  };

  // Persist the full config array as a draft
  const persistAllConfigs = async () => {
    const configs = buildPageConfigs(graph.getAllPages());
    await fetch(`${API_BASE_URL}/site/${siteSlug || ''}/site-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs, isDraft: true })
    });
  };

  // Function to immediately persist tracking changes to prevent them from being overridden
  const persistTrackingChange = async (page: IPage) => {
    try {
      // Ensure the page has configuration for persistence
      if (!page.conf) {
        page.conf = { title: page.title, config: { list_type: 'whitelist' } };
      }
      if (!page.conf.config) {
        page.conf.config = { list_type: 'whitelist' };
      }

      // Set the tracked state in the configuration
      page.conf.config.tracked = page.tracked;

      await persistAllConfigs();

      logger.debug(`Tracking state persisted for page: ${page.title} (subdirectory: ${page.sourceGraphSubdirectory || '(root)'}, tracked: ${page.tracked})`);
    } catch (error) {
      logger.error('Error persisting tracking change:', error);
    }
  };

  const handleTrackPage = async (pageId: string) => {
    const page = graph.getPage(pageId);
    if (page) {
      const newTracked = !page.tracked;
      page.tracked = newTracked;

      if (page.tracked) {
        ensurePageConfigForPersistence(page, 'whitelist');
      }
      // Keep conf.config.tracked in sync with the page state so the persisted
      // config reflects the untrack as well as the track.
      if (page.conf?.config) {
        page.conf.config.tracked = page.tracked;
      }

      // Simple op: auto-save (commit) unless there are already draft changes
      // from a complex op, in which case stay in the draft flow and let the
      // user click Save explicitly.
      if (!hasDraftChanges && onAutoSave) {
        await onAutoSave();
      } else {
        await persistTrackingChange(page);
      }

      // Skip onConfigChange (which reloads the graph from backend) since the
      // persist/auto-save above already saved the config. A graph reload would
      // temporarily show 0 tracked pages until configs are re-applied, causing
      // a visual flash.
      graph.notifyChange();
      onSelectedPagesChange(new Set(selectedPages));
      onCheckDraftStatus?.();
    }
  };

  const handleBlacklistPage = async (pageId: string) => {
    const page = graph.getPage(pageId);
    if (page) {
      page.blacklisted = !page.blacklisted;

      if (page.blacklisted) {
        page.tracked = true; // Also ensure the page tracked when blacklisting
        ensurePageConfigForPersistence(page, 'blacklist');
      } else {
        // Un-blacklisting a single page: restore whitelist list_type if config exists.
        if (page.conf?.config) {
          page.conf.config.list_type = 'whitelist';
        }
      }

      // Simple op: auto-save the single blacklist change so the user doesn't
      // need to click Save. If a complex op is already pending, stay in draft
      // mode instead and let the Save button continue to cover both changes.
      if (!hasDraftChanges && onAutoSave) {
        await onAutoSave();
        graph.notifyChange();
      } else {
        await persistAllConfigs();
        onCheckDraftStatus?.();
        forceReRender();
      }
    }
  };

  const handleUpdatePageConfig = (pageId: string, key: keyof SitePageConfig['config'], value: number | boolean) => {
    const page = graph.getPage(pageId);
    if (page) {
      // Ensure conf and conf.config objects exist
      page.conf = page.conf || { title: page.title, config: { list_type: page.blacklisted ? 'blacklist' : 'whitelist' } };
      page.conf.config = page.conf.config || { list_type: page.blacklisted ? 'blacklist' : 'whitelist' };

      // Update the specific config key
      (page.conf.config[key] as number | boolean) = value;

      page.tracked = true;
      if (!page.conf.config.list_type) {
        page.conf.config.list_type = 'whitelist';
      }

      forceReRender();
    }
  };

  const handleDeletePageConfigKey = (pageId: string, key: keyof SitePageConfig['config']) => {
    const page = graph.getPage(pageId);
    if (page && page.conf && page.conf.config) {
      delete page.conf.config[key];
      forceReRender();
    }
  };

  const handleTrackSelected = async () => {
    let anyChanged = false;
    selectedPages.forEach(pageId => {
      const page = graph.getPage(pageId);
      if (page && !currentDisplayGraph.getDisplayPage(pageId)?.isEffectivelySensitive) {
        page.tracked = true;
        ensurePageConfigForPersistence(page, 'whitelist');
        page.conf!.config.tracked = true;
        anyChanged = true;
      }
    });

    // Persist all tracking changes. Auto-save (commit) when there are no
    // pending complex-op draft changes; otherwise fall back to the draft flow.
    if (anyChanged) {
      try {
        if (!hasDraftChanges && onAutoSave) {
          await onAutoSave();
        } else {
          await persistAllConfigs();
        }
      } catch (error) {
        logger.error('Error persisting batch tracking changes:', error);
      }
    }

    // Skip onConfigChange (which reloads the graph from backend) since the
    // persist/auto-save above already saved the config. See handleTrackPage.
    graph.notifyChange();
    onSelectedPagesChange(new Set(selectedPages));
    if (hasDraftChanges) {
      onCheckDraftStatus?.();
    }
  };

  const handleBlacklistSelected = () => {
    selectedPages.forEach(pageId => {
      const page = graph.getPage(pageId);
      if (page) {
        page.blacklisted = true;
        page.tracked = true;
        ensurePageConfigForPersistence(page, 'blacklist');
      }
    });
    forceReRender();
  };

  // Core function that actually performs the sensitive marking operation
  const performMarkSensitive = async (pageId: string, isSensitive: boolean) => {
    const page = graph.getPage(pageId);
    if (!page) return;

    try {
      // Call the API to update the file
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug || ''}/page/${encodeURIComponent(page.title)}/sensitive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSensitive, sourceGraphDirectory: page.sourceGraphSubdirectory })
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('Error marking page as sensitive:', errorData);
        window.alert(`Failed to mark page as ${isSensitive ? 'sensitive' : 'non-sensitive'}: ${errorData.error}`);
        return;
      }

      // Update the page in memory
      page.sensitive = isSensitive;

      // Force re-render to reflect changes
      forceReRender();

    } catch (error) {
      logger.error('Error calling sensitive API:', error);
      window.alert(`Failed to mark page as ${isSensitive ? 'sensitive' : 'non-sensitive'}`);
    }
  };

  // Handler that checks consent before marking sensitive
  const handleMarkSensitive = async (pageId: string, isSensitive: boolean) => {
    // If marking as sensitive (not removing) and user hasn't consented yet, show modal
    if (isSensitive && !hasSensitiveConsent) {
      setPendingSensitiveOperation({ pageId, isSensitive });
      setShowSensitiveConsentModal(true);
      return;
    }

    // User has consented or is removing sensitive flag, proceed directly
    await performMarkSensitive(pageId, isSensitive);
  };

  // Handle user consent for adding meadow-sensitive property
  const handleSensitiveConsentAccept = async () => {
    try {
      // Save consent to app config
      const response = await fetch(`${API_BASE_URL}/app-config/callout-dismissal/allowAddMeadowSensitivePropertyToSourcePages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true })
      });

      if (!response.ok) {
        logger.error('Error saving consent');
        window.alert('Failed to save consent. Please try again.');
        return;
      }

      // Update local state
      setHasSensitiveConsent(true);

      // Close modal
      setShowSensitiveConsentModal(false);

      // Proceed with the pending operation
      if (pendingSensitiveOperation) {
        await performMarkSensitive(pendingSensitiveOperation.pageId, pendingSensitiveOperation.isSensitive);
        setPendingSensitiveOperation(null);
      }
    } catch (error) {
      logger.error('Error saving consent:', error);
      window.alert('Failed to save consent. Please try again.');
    }
  };

  const handleSensitiveConsentCancel = () => {
    setShowSensitiveConsentModal(false);
    setPendingSensitiveOperation(null);
  };

  const handlePageContextMenu = useCallback((pageId: string, x: number, y: number) => {
    setContextMenuPage({ pageId, x, y });
  }, []);

  // Update session storage when active view changes
  useEffect(() => {
    sessionStorage.setItem('graphActiveView', activeView);
  }, [activeView]);

  // Memoized handler to prevent unnecessary re-renders
  // Uses functional update to handle multiple rapid changes correctly
  const handleFilterChange = useCallback(
    (filterId: string, changes: Partial<IFilter>) => {
      onFiltersChange(prevFilters => prevFilters.map(filter =>
        filter.id === filterId ? { ...filter, ...changes } : filter
      ));
    },
    [onFiltersChange]
  );

  return (
    <div className="flex h-full">
      {/* Left sidebar with filter panel */}
      <div className="w-[310px] p-4 bg-gray-100 border-r flex flex-col space-y-4 overflow-y-auto">
                    <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
              siteSlug={siteSlug}
              onCustomFiltersChange={() => {
                // Trigger a reload of custom filters from the backend
                if (onReloadCustomFilters) {
                  onReloadCustomFilters();
                }
              }}
              untrackedPagesCount={untrackedPagesCount}
            />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* View selection tabs in the right area */}
        <div className="border-b bg-white">
          <nav className="flex items-center justify-between">
            <div className="flex">
              <button
                className={`
                  py-2 px-4 border-b-2 font-medium text-sm
                  ${activeView === 'graph'
                    ? 'border-main-500 text-main-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
                onClick={() => setActiveView('graph')}
              >
                Graph View
              </button>
              <button
                className={`
                  py-2 px-4 border-b-2 font-medium text-sm
                  ${activeView === 'list'
                    ? 'border-main-500 text-main-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
                onClick={() => setActiveView('list')}
              >
                List View
              </button>
            </div>
            <div className="flex items-center gap-2 pr-3">
              {/* Selection filter controls - shown when pages are selected */}
              {selectedPages.size > 0 && (
                <div className="flex items-center space-x-1 mr-2 pr-2 border-r border-gray-200">
                  <span className="text-sm text-gray-700 mr-1">Selection</span>
                  <button
                    onClick={() => setSelectionShowTitles(prev => !prev)}
                    className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                      selectionShowTitles
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title="Show text labels"
                  >
                    T
                  </button>
                  <button
                    onClick={handleSoloSelection}
                    className={`w-6 h-6 flex items-center justify-center rounded ${
                      isSoloActive
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                    title={isSoloActive ? 'Exit solo mode' : 'Solo'}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="8" r="4" />
                    </svg>
                  </button>
                  <button
                    onClick={handleHideSelection}
                    className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
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
              {/* Exit solo button - shown when in solo mode but no selection */}
              {isSoloActive && selectedPages.size === 0 && (
                <div className="flex items-center space-x-1 mr-2 pr-2 border-r border-gray-200">
                  <span className="text-sm text-gray-700 mr-1">Selection</span>
                  <button
                    onClick={handleSoloSelection}
                    className="w-6 h-6 flex items-center justify-center rounded bg-blue-500 text-white"
                    title="Solo"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="8" r="4" />
                    </svg>
                  </button>
                </div>
              )}
              {/* Clear hidden button - shown when pages are hidden */}
              {hasHiddenPages && (
                <div className="flex items-center space-x-2 mr-2 pr-2 border-r border-gray-200">
                  <span className="text-sm text-gray-700">Hidden ({hiddenPages.size})</span>
                  <button
                    onClick={handleClearHidden}
                    className="px-2 py-1 text-xs rounded bg-red-500 text-white"
                    title={`Show ${hiddenPages.size} hidden page${hiddenPages.size > 1 ? 's' : ''}`}
                  >
                    Show
                  </button>
                </div>
              )}
              <button
                onClick={handleSelectAllVisible}
                className="px-3 py-1 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded"
              >
                Select All
              </button>
              <button
                onClick={handleSelectNone}
                disabled={selectedPages.size === 0}
                className={`px-3 py-1 text-sm rounded ${
                  selectedPages.size === 0
                    ? 'text-neutral-300 cursor-default'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`}
              >
                Select None
              </button>
              <SitePageTabsDropdown
                selectedPages={selectedPages}
                graph={graph}
                onRefresh={onRefresh}
              />
            </div>
          </nav>
        </div>

        {/* Main view content */}
        <div className="flex-1 relative overflow-hidden">
          {activeView === 'graph' ? (
            <div className="absolute inset-0">
              <GraphVis
                graph={graph}
                initialPageId={initialPageId}
                filters={combinedFilters}
                selectedPages={selectedPages}
                onSelectedPagesChange={onSelectedPagesChange}
                siteSlug={siteSlug}
                graphUpdateTrigger={graphUpdateTrigger}
                onPageContextMenu={handlePageContextMenu}
                isSitePagesOnlyToggleActive={isSitePagesOnlyToggleActive}
                sitePreviewHover={sitePreviewHover}
              />
            </div>
          ) : (
            <div className="absolute inset-0">
              <ListView
                displayGraph={currentDisplayGraph}
                onPageClick={handlePageClick}
                siteSlug={siteSlug}
                onPageContextMenu={handlePageContextMenu}
                selectedPages={selectedPages}
                onSelectedPagesChange={onSelectedPagesChange}
              />
            </div>
          )}
          <div className="absolute top-2 right-2 z-10">
            <SitePagesToggle
              isActive={isSitePagesOnlyToggleActive}
              onToggle={handleSitePagesOnlyToggle}
              onHoverStart={activeView === 'graph' ? () => setSitePreviewHover(true) : undefined}
              onHoverEnd={activeView === 'graph' ? () => setSitePreviewHover(false) : undefined}
            />
          </div>
          {isEmptyDueToSolo && (
            <EmptySoloCallout onTurnOffSolos={handleTurnOffSolos} />
          )}
        </div>
      </div>

      {/* Right panel for selection management */}
      <div
        className={`border-l bg-white transition-all duration-300 ease-in-out flex ${
          isSelectionPanelCollapsed ? 'w-[40px]' : 'w-[320px]'
        }`}
      >
        {isSelectionPanelCollapsed ? (
          <button
            onClick={() => onSelectionPanelCollapseChange(false)}
            className="flex items-center justify-center w-full hover:bg-gray-100 focus:outline-none"
          >
            <div className="transform -rotate-90 whitespace-nowrap text-gray-500">
              Selected
            </div>
          </button>
        ) : (
          <SitePageSelectionSidebar
            selectedPages={selectedPages}
            graph={graph}
            onClose={() => onSelectionPanelCollapseChange(true)}
            onSelectedPagesChange={onSelectedPagesChange}
            onTrackPage={handleTrackPage}
            onBlacklistPage={handleBlacklistPage}
            onTrackSelected={handleTrackSelected}
            onBlacklistSelected={handleBlacklistSelected}
            isEffectivelySensitive={page => currentDisplayGraph.getDisplayPage(page.id)?.isEffectivelySensitive ?? false}
            onUpdatePageConfig={handleUpdatePageConfig}
            onDeletePageConfigKey={handleDeletePageConfigKey}
            onPreviewPage={onPreviewPage}
            hasDraftChanges={hasDraftChanges}
            onMarkSensitive={handleMarkSensitive}
            obsidianInfo={obsidianInfo}
          />
        )}
      </div>

      {/* Right-click context menu for pages */}
      {contextMenuPage && (() => {
        const page = graph.getPage(contextMenuPage.pageId);
        if (!page) return null;
        return (
          <PageContextMenu
            page={page}
            graph={graph}
            position={{ x: contextMenuPage.x, y: contextMenuPage.y }}
            onClose={() => setContextMenuPage(null)}
            onTrackPage={handleTrackPage}
            onBlacklistPage={handleBlacklistPage}
            onPreviewPage={onPreviewPage}
            hasDraftChanges={hasDraftChanges}
            onSelectedPagesChange={onSelectedPagesChange}
            onMarkSensitive={handleMarkSensitive}
            obsidianInfo={obsidianInfo}
          />
        );
      })()}

      {/* Consent Modal for meadow-sensitive property */}
      <Modal
        isOpen={showSensitiveConsentModal}
        onClose={handleSensitiveConsentCancel}
        title="Heads Up"
        className="w-[500px] h-auto"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600 space-y-3">
            <p>
              Marking a page as <strong>meadow-sensitive</strong> will add a property
              directly to the source file in your notes folder.
            </p>
            <p>
              Specifically, a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">meadow-sensitive: true</code> frontmatter
              property will be added to the markdown file.
            </p>
            <p className="text-gray-500 text-xs">
              This allows the sensitive status to persist across sessions and be part of your
              source of truth. The property will be removed if you later mark the page as not sensitive.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={handleSensitiveConsentCancel}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSensitiveConsentAccept}
              className="px-4 py-2 text-white bg-main-600 rounded hover:bg-main-700"
            >
              I Understand, Proceed
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SitePageTabs;
