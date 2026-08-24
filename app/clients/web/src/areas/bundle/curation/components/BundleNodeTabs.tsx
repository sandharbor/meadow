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
import { apiRequest } from '../../../../shared/utils/apiClient';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import { IFilter, calculateOptimalGapThreshold, createOutlinkDiscrepancySelector, createInlinkDiscrepancySelector } from '../types/filters';
import { DisplayGraph } from '../types/displayGraph';
import GraphVis from './GraphVis';
import ListView from './ListView';
import OrphansView from './OrphansView';
import { OrphansBanner } from './OrphansBanner';
import FilterPanel from './FilterPanel';
import BundleNodeSelectionSidebar from './BundleNodeSelectionSidebar';
import BundleNodeTabsDropdown from './BundleNodeTabsDropdown';
import BundleNodeContextMenu, { canMarkNodeSensitive, ObsidianInfo } from './BundleNodeContextMenu';
import EmptySoloCallout from './EmptySoloCallout';
import BundlePagesToggle from './BundlePagesToggle';
import ResizableSidebar from './ResizableSidebar';
import { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig';
import { buildNodeConfigs, getOrphanNodeConfigs } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils';
import Modal from '../../../../shared/components/Modal';
import { AppConfig } from '../../../../../../../contracts/types/appConfig';
import { logger } from '../../../../shared/utils/logger';
import { useDisplayFilters } from '../utils/useDisplayFilters';
import FolderScopeChangesBanner from './FolderScopeChangesBanner';
import type { FolderScopeChangeExplanation } from '../../../../../../../contracts/types/folderScopeChanges';
import { useIsFolderBasedBundle } from '../utils/bundleMode';
import {
  ensureNodeConfigForPersistence,
  mutateFileTrackingOptimistically,
  trackNodesOptimistically,
} from '../utils/bundleTrackingInteraction';

interface BundleNodeTabsProps {
  graph: Graph;
  entryBundleNodeId?: string;
  filters: IFilter[];
  onFiltersChange: React.Dispatch<React.SetStateAction<IFilter[]>>;
  onReloadCustomFilters?: () => void;
  onConfigChange?: () => void;
  onCheckDraftStatus?: () => void;
  onAutoSave?: () => Promise<void> | void;
  isSelectionPanelCollapsed: boolean;
  onSelectionPanelCollapseChange: (collapsed: boolean) => void;
  selectedNodeKeys: Set<string>;
  onSelectedNodeKeysChange: (pages: Set<string>) => void;
  onPreviewPage: (bundleNodeKey: string) => void;
  hasDraftChanges: boolean;
  bundleSlug: string;
  onRefresh: () => void;
  onRefreshNodeConfigs: () => void;
  untrackedNodeCount: number;
  graphUpdateTrigger: number;
  bundleNodeConfigs: BundleNodeConfig[] | null;
  protectedBundleNodeIds: Set<string>;
  onRemoveOrphanConfig: (config: BundleNodeConfig) => Promise<void>;
  onRemoveAllOrphanConfigs: () => Promise<void>;
  folderScopeChanges?: FolderScopeChangeExplanation;
}

type ViewType = 'graph' | 'list';

const BundleNodeTabs: React.FC<BundleNodeTabsProps> = ({
  graph,
  entryBundleNodeId,
  filters,
  onFiltersChange,
  onReloadCustomFilters,
  onConfigChange,
  onCheckDraftStatus,
  onAutoSave,
  isSelectionPanelCollapsed,
  onSelectionPanelCollapseChange,
  selectedNodeKeys,
  onSelectedNodeKeysChange,
  onPreviewPage,
  hasDraftChanges,
  bundleSlug,
  onRefresh,
  onRefreshNodeConfigs,
  untrackedNodeCount,
  graphUpdateTrigger,
  bundleNodeConfigs,
  protectedBundleNodeIds,
  onRemoveOrphanConfig,
  onRemoveAllOrphanConfigs,
  folderScopeChanges,
}) => {
  const [activeView, setActiveView] = useState<ViewType>(() => {
    const stored = sessionStorage.getItem('graphActiveView');
    if (stored === 'graph' || stored === 'list') {
      return stored;
    }
    return 'graph';
  });
  const [isOrphansModalOpen, setIsOrphansModalOpen] = useState(false);
  const isFolderBasedBundle = useIsFolderBasedBundle(graph, entryBundleNodeId, graphUpdateTrigger);

  useEffect(() => {
    sessionStorage.setItem('graphActiveView', activeView);
  }, [activeView]);

  const orphanConfigs = useMemo(() => {
    if (!bundleNodeConfigs) return [];
    return getOrphanNodeConfigs(bundleNodeConfigs, graph.getAllNodes());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- graphUpdateTrigger forces recompute when graph is mutated in-place
  }, [bundleNodeConfigs, graph, graphUpdateTrigger]);

  useEffect(() => {
    if (orphanConfigs.length === 0) {
      setIsOrphansModalOpen(false);
    }
  }, [orphanConfigs.length]);

  const untrackProtectedBundleNodeIds = useMemo(() => {
    const ids = new Set(protectedBundleNodeIds);
    for (const config of bundleNodeConfigs ?? []) {
      if (config.bundleNodeKind !== 'collection') continue;
      ids.add(config.bundleNodeId);
      for (const memberId of config.memberBundleNodeIds) ids.add(memberId);
    }
    return ids;
  }, [protectedBundleNodeIds, bundleNodeConfigs]);

  const structuralDescendants = useCallback((bundleNodeKey: string): IBundleNode[] => {
    const result: IBundleNode[] = [];
    const pending = [bundleNodeKey];
    const seen = new Set(pending);
    while (pending.length > 0) {
      const current = pending.shift()!;
      for (const edge of graph.getOutgoingEdges(current)) {
        if (edge.bundleEdgeKind === 'semanticLink' || seen.has(edge.target)) continue;
        seen.add(edge.target);
        const child = graph.getNode(edge.target);
        if (child) {
          result.push(child);
          pending.push(child.bundleNodeKey);
        }
      }
    }
    return result;
  }, [graph]);

  const canBlacklistNode = useCallback((node: IBundleNode): boolean => {
    if (node.bundleNodeKind === 'collection') return false;
    if (node.bundleNodeId && protectedBundleNodeIds.has(node.bundleNodeId)) return false;
    if (node.bundleNodeKind === 'folder') {
      return !structuralDescendants(node.bundleNodeKey)
        .some(descendant => descendant.bundleNodeId && protectedBundleNodeIds.has(descendant.bundleNodeId));
    }
    return true;
  }, [protectedBundleNodeIds, structuralDescendants]);

  const confirmFolderBlacklist = useCallback((nodes: IBundleNode[]): boolean => {
    const folders = nodes.filter(node => node.bundleNodeKind === 'folder' && !node.blacklisted);
    if (folders.length === 0) return true;
    const affected = new Map<string, IBundleNode>();
    for (const folder of folders) {
      for (const descendant of structuralDescendants(folder.bundleNodeKey)) affected.set(descendant.bundleNodeKey, descendant);
    }
    const configuredCount = [...affected.values()].filter(node => Boolean(node.conf)).length;
    const predictedRemovalCount = [...affected.values()].filter(node => node.tracked && !node.blacklisted).length;
    return window.confirm(
      `Blacklist ${folders.length} folder${folders.length === 1 ? '' : 's'} as a hard subtree boundary?\n\n`
      + `${affected.size} descendant nodes are in the raw graph, including ${configuredCount} configured nodes. `
      + `${predictedRemovalCount} currently publishable nodes are predicted to leave the final graph.\n\n`
      + 'Existing descendant curation will be preserved and restored if the folder blacklist is removed.'
    );
  }, [structuralDescendants]);

  const [hiddenNodeKeys, setHiddenNodeKeys] = useState<Set<string>>(new Set());
  const [soloNodeKeys, setSoloNodeKeys] = useState<Set<string>>(new Set());
  const [selectionShowTitles, setSelectionShowTitles] = useState(false);

  const [contextMenuPage, setContextMenuPage] = useState<{ bundleNodeKey: string; x: number; y: number } | null>(null);

  const [obsidianInfo, setObsidianInfo] = useState<ObsidianInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadObsidianInfo = async () => {
      try {
        const res = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/obsidian-info`);
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
    if (bundleSlug) {
      loadObsidianInfo();
    }
    return () => { cancelled = true; };
  }, [bundleSlug]);

  // State for meadow-sensitive consent modal
  const [showSensitiveConsentModal, setShowSensitiveConsentModal] = useState(false);
  const [pendingSensitiveOperation, setPendingSensitiveOperation] = useState<{
    bundleNodeKey: string;
    isSensitive: boolean;
  } | null>(null);
  const [hasSensitiveConsent, setHasSensitiveConsent] = useState<boolean | null>(null);

  // Check if user has already consented to adding meadow-sensitive property
  useEffect(() => {
    const checkConsent = async () => {
      try {
        const response = await apiRequest(`app-config`);
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
    const graphId = `${graph.getAllNodes().length}-${bundleSlug}`;

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
          bundleNodeSelectors: [createOutlinkDiscrepancySelector(outlinkThreshold)],
          thresholdValue: outlinkThreshold
        };
      }
      if (filter.id === 'inlink-gap-filter') {
        return {
          ...filter,
          bundleNodeSelectors: [createInlinkDiscrepancySelector(inlinkThreshold)],
          thresholdValue: inlinkThreshold
        };
      }
      return filter;
    }));
  }, [graph, bundleSlug, onFiltersChange]);

  const {
    combinedFilters,
    effectiveExpression: effectiveFilterExpression,
    setExpression: handleFilterExpressionChange
  } = useDisplayFilters({
    filters, graph, graphUpdateTrigger, hiddenNodeKeys, selectedNodeKeys,
    selectionShowTitles, bundleSlug, soloNodeKeys
  });

  // Create and manage the DisplayGraph using useMemo for immediate availability
  const currentDisplayGraph = useMemo(() => {
    const dg = new DisplayGraph(graph);
    dg.setFilters(combinedFilters, effectiveFilterExpression);
    dg.setSelectedNodeKeys(selectedNodeKeys);
    if (entryBundleNodeId) {
      dg.setEntryNode(entryBundleNodeId);
    }
    return dg;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- graphUpdateTrigger forces recompute when graph is mutated in-place
  }, [graph, combinedFilters, effectiveFilterExpression, selectedNodeKeys, entryBundleNodeId, graphUpdateTrigger]);

  // When pages are selected, expand the panel
  useEffect(() => {
    if (selectedNodeKeys.size > 0) {
      onSelectionPanelCollapseChange(false);
    }
  }, [selectedNodeKeys.size, onSelectionPanelCollapseChange]);

  const forceReRender = () => {
    onSelectedNodeKeysChange(new Set(selectedNodeKeys));
    onConfigChange?.(); // Notify parent of config change
  };

  const handlePageClick = (bundleNodeKey: string) => {
    const page = graph.getNode(bundleNodeKey);
    if (page) {
      if (selectedNodeKeys.has(bundleNodeKey)) {
        const newSelected = new Set(selectedNodeKeys);
        newSelected.delete(bundleNodeKey);
        onSelectedNodeKeysChange(newSelected);
      } else {
        // New selections should float to the top of the selection list
        onSelectedNodeKeysChange(new Set([bundleNodeKey, ...selectedNodeKeys]));
      }
    }
  };

  const handleSelectAllVisible = () => {
    let visibleNodes = currentDisplayGraph.visibleDisplayNodes;
    if (isBundlePreviewOnlyActive) {
      visibleNodes = visibleNodes.filter(page =>
        page.underlyingNode.tracked && !page.underlyingNode.blacklisted && !page.underlyingNode.isFrontierNode
      );
    }
    onSelectedNodeKeysChange(new Set(visibleNodes.map(page => page.bundleNodeKey)));
  };

  const handleSelectNone = () => {
    onSelectedNodeKeysChange(new Set());
  };

  // Solo selection - show only selected pages
  const handleSoloSelection = () => {
    if (soloNodeKeys.size > 0) {
      // If already in solo mode, exit it
      setSoloNodeKeys(new Set());
    } else {
      // Enter solo mode with current selection
      setSoloNodeKeys(new Set(selectedNodeKeys));
    }
  };

  // Hide selection - hide the selected pages
  const handleHideSelection = () => {
    setHiddenNodeKeys(prev => {
      const next = new Set(prev);
      selectedNodeKeys.forEach(id => next.add(id));
      return next;
    });
    // Clear selection after hiding
    onSelectedNodeKeysChange(new Set());
  };

  // Clear hidden pages
  const handleClearHidden = () => {
    setHiddenNodeKeys(new Set());
  };

  // State for "Show Bundle" solo mode
  const [isBundlePreviewOnlyActive, setIsBundlePreviewOnlyActive] = useState(false);
  const [bundlePreviewHover, setBundlePreviewHover] = useState(false);

  // Check if we're in solo mode
  const isSoloActive = soloNodeKeys.size > 0;
  const hasHiddenPages = hiddenNodeKeys.size > 0;

  // Check if the view is empty due to active solos
  const hasSoloFilters = combinedFilters.some(f => f.isSolo && f.enabled);
  const isEmptyDueToSolo = currentDisplayGraph.visibleDisplayNodes.length === 0 && hasSoloFilters;

  const handleTurnOffSolos = () => {
    // Turn off solo on all filters
    onFiltersChange(prev => prev.map(f => f.isSolo ? { ...f, isSolo: false } : f));
    // Clear selection solo
    setSoloNodeKeys(new Set());
  };

  // Handle "Show Only Bundle Pages" toggle
  const handleBundlePreviewOnlyToggle = useCallback(() => {
    setIsBundlePreviewOnlyActive(prev => !prev);
  }, []);

  const ensurePageConfigForPersistence = (page: IBundleNode, listType: 'whitelist' | 'blacklist') => {
    ensureNodeConfigForPersistence({
      node: page,
      listType,
      existingIds: [
        ...(bundleNodeConfigs ?? []).map(config => config.bundleNodeId),
        ...graph.getAllNodes().flatMap(node => node.bundleNodeId ? [node.bundleNodeId] : []),
      ],
    });
  };

  // Persist the full config array as a draft
  const persistAllConfigs = async () => {
    const configs = buildNodeConfigs(graph.getAllNodes());
    await apiRequest(`bundles/${bundleSlug || ''}/curation/bundle-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs, isDraft: true })
    });
  };

  // Function to immediately persist tracking changes to prevent them from being overridden
  const persistTrackingChange = async (page: IBundleNode) => {
    try {
      await persistAllConfigs();

      logger.debug(`Tracking state persisted for page: ${page.bundleNodeName} (subdirectory: ${page.sourceGraphSubdirectory || '(root)'}, tracked: ${page.tracked})`);
    } catch (error) {
      logger.error('Error persisting tracking change:', error);
    }
  };

  const handleTrackPage = async (bundleNodeKey: string) => {
    const page = graph.getNode(bundleNodeKey);
    if (page) {
      if (page.bundleNodeKind === 'collection' || page.effectiveBlacklistingBundleNodeId) return;
      const newTracked = !page.tracked;
      if (!newTracked && page.bundleNodeId && untrackProtectedBundleNodeIds.has(page.bundleNodeId)) return;

      if (page.bundleNodeKind === 'file') {
        try {
          const effectivelySensitive = currentDisplayGraph.getDisplayNode(bundleNodeKey)?.isEffectivelySensitive ?? false;
          await mutateFileTrackingOptimistically({
            bundleSlug,
            page,
            tracked: newTracked,
            effectivelySensitive,
            notifyChange: () => graph.notifyChange(),
          });
          onSelectedNodeKeysChange(new Set(selectedNodeKeys));
          onRefreshNodeConfigs();
          onCheckDraftStatus?.();
        } catch (error) {
          logger.error('Error applying one-file tracking command:', error);
        }
        return;
      }
      page.tracked = newTracked;

      if (page.tracked) {
        ensurePageConfigForPersistence(page, 'whitelist');
      } else {
        delete page.conf;
        delete page.bundleNodeId;
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
      onSelectedNodeKeysChange(new Set(selectedNodeKeys));
      onCheckDraftStatus?.();
    }
  };

  const handleBlacklistPage = async (bundleNodeKey: string) => {
    const page = graph.getNode(bundleNodeKey);
    if (page) {
      if (!page.blacklisted && !canBlacklistNode(page)) return;
      if (!confirmFolderBlacklist([page])) return;
      page.blacklisted = !page.blacklisted;

      if (page.blacklisted) {
        page.tracked = true; // Also ensure the page tracked when blacklisting
        ensurePageConfigForPersistence(page, 'blacklist');
      } else {
        // Un-blacklisting a single page: restore whitelist list_type if config exists.
        if (page.conf) {
          page.conf.listType = 'whitelist';
        }
      }

      // Simple op: auto-save the single blacklist change so the user doesn't
      // need to click Save. If a complex op is already pending, stay in draft
      // mode instead and let the Save button continue to cover both changes.
      if (!hasDraftChanges && onAutoSave) {
        await onAutoSave();
        onRefresh();
        graph.notifyChange();
      } else {
        await persistAllConfigs();
        onCheckDraftStatus?.();
        forceReRender();
      }
    }
  };

  const handleUpdatePageConfig = (bundleNodeKey: string, key: 'outlinksDepth' | 'inlinksDepth', value: number) => {
    const page = graph.getNode(bundleNodeKey);
    if (page && page.bundleNodeKind !== 'collection' && !page.effectiveBlacklistingBundleNodeId) {
      ensurePageConfigForPersistence(page, page.blacklisted ? 'blacklist' : 'whitelist');
      page.conf![key] = value;

      page.tracked = true;
      if (!page.conf!.listType) {
        page.conf!.listType = 'whitelist';
      }

      forceReRender();
    }
  };

  const handleDeletePageConfigKey = (bundleNodeKey: string, key: 'outlinksDepth' | 'inlinksDepth') => {
    const page = graph.getNode(bundleNodeKey);
    if (page?.conf) {
      delete page.conf[key];
      forceReRender();
    }
  };

  const handleTrackSelected = async () => {
    const nodeKeys = [...selectedNodeKeys].filter(bundleNodeKey => {
      const page = graph.getNode(bundleNodeKey);
      return Boolean(
        page
        && !page.tracked
        && page.bundleNodeKind !== 'collection'
        && !page.effectiveBlacklistingBundleNodeId
        && !currentDisplayGraph.getDisplayNode(bundleNodeKey)?.isEffectivelySensitive,
      );
    });
    if (nodeKeys.length === 0) return;
    const nodes = nodeKeys
      .map(bundleNodeKey => graph.getNode(bundleNodeKey))
      .filter((node): node is IBundleNode => Boolean(node));
    try {
      await trackNodesOptimistically({
        bundleSlug,
        nodes,
        notifyChange: () => graph.notifyChange(),
      });
      onSelectedNodeKeysChange(new Set(selectedNodeKeys));
      onRefreshNodeConfigs();
      onCheckDraftStatus?.();
    } catch (error) {
      logger.error('Error applying safe batch tracking command:', error);
    }
  };

  const handleBlacklistSelected = () => {
    const candidates = [...selectedNodeKeys]
      .map(bundleNodeKey => graph.getNode(bundleNodeKey))
      .filter((page): page is IBundleNode => Boolean(page) && !page!.blacklisted && canBlacklistNode(page!));
    if (!confirmFolderBlacklist(candidates)) return;
    selectedNodeKeys.forEach(bundleNodeKey => {
      const page = graph.getNode(bundleNodeKey);
      if (page && canBlacklistNode(page)) {
        page.blacklisted = true;
        page.tracked = true;
        ensurePageConfigForPersistence(page, 'blacklist');
      }
    });
    forceReRender();
  };

  // Core function that actually performs the sensitive marking operation
  const performMarkSensitive = async (bundleNodeKey: string, isSensitive: boolean) => {
    const page = graph.getNode(bundleNodeKey);
    if (!page || !canMarkNodeSensitive(page)) return;

    try {
      // Call the API to update the file
      const response = await apiRequest(`bundles/${bundleSlug || ''}/curation/page/${encodeURIComponent(page.bundleNodeName)}/sensitive`, {
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
  const handleMarkSensitive = async (bundleNodeKey: string, isSensitive: boolean) => {
    // If marking as sensitive (not removing) and user hasn't consented yet, show modal
    if (isSensitive && !hasSensitiveConsent) {
      setPendingSensitiveOperation({ bundleNodeKey, isSensitive });
      setShowSensitiveConsentModal(true);
      return;
    }

    // User has consented or is removing sensitive flag, proceed directly
    await performMarkSensitive(bundleNodeKey, isSensitive);
  };

  // Handle user consent for adding meadow-sensitive property
  const handleSensitiveConsentAccept = async () => {
    try {
      // Save consent to app config
      const response = await apiRequest(`app-config/callout-dismissal/allowAddMeadowSensitivePropertyToSourcePages`, {
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
        await performMarkSensitive(pendingSensitiveOperation.bundleNodeKey, pendingSensitiveOperation.isSensitive);
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

  const handleBundleNodeContextMenu = useCallback((bundleNodeKey: string, x: number, y: number) => {
    setContextMenuPage({ bundleNodeKey, x, y });
  }, []);

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
    <div className="flex h-full min-w-0">
      <ResizableSidebar
        side="left"
        defaultWidth={310}
        minWidth={240}
        maxWidth={480}
        storageKey="bundleEditorFilterSidebarWidth"
        ariaLabel="Resize filters sidebar"
        testId="filters-sidebar"
        className="flex flex-col space-y-4 overflow-y-auto bg-gray-100 p-4"
      >
        <FilterPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          bundleSlug={bundleSlug}
          onCustomFiltersChange={() => {
            // Trigger a reload of custom filters from the backend
            if (onReloadCustomFilters) {
              onReloadCustomFilters();
            }
          }}
          untrackedNodeCount={untrackedNodeCount}
          pages={graph.getAllNodes()} graph={graph}
          filterExpression={effectiveFilterExpression}
          filterExpressionFilters={combinedFilters}
          onFilterExpressionChange={handleFilterExpressionChange}
        />
      </ResizableSidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <OrphansBanner
          orphanCount={orphanConfigs.length}
          onReview={() => setIsOrphansModalOpen(true)}
        />
        <FolderScopeChangesBanner explanation={folderScopeChanges} />
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
              {selectedNodeKeys.size > 0 && (
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
              {isSoloActive && selectedNodeKeys.size === 0 && (
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
                  <span className="text-sm text-gray-700">Hidden ({hiddenNodeKeys.size})</span>
                  <button
                    onClick={handleClearHidden}
                    className="px-2 py-1 text-xs rounded bg-red-500 text-white"
                    title={`Show ${hiddenNodeKeys.size} hidden page${hiddenNodeKeys.size > 1 ? 's' : ''}`}
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
                disabled={selectedNodeKeys.size === 0}
                className={`px-3 py-1 text-sm rounded ${
                  selectedNodeKeys.size === 0
                    ? 'text-neutral-300 cursor-default'
                    : 'text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100'
                }`}
              >
                Select None
              </button>
              <BundleNodeTabsDropdown
                selectedNodeKeys={selectedNodeKeys}
                graph={graph}
                onRefresh={onRefresh}
              />
            </div>
          </nav>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {activeView === 'graph' ? (
            <div className="absolute inset-0">
              <GraphVis
                graph={graph}
                displayGraph={currentDisplayGraph}
                filters={combinedFilters}
                selectedNodeKeys={selectedNodeKeys}
                onSelectedNodeKeysChange={onSelectedNodeKeysChange}
                bundleSlug={bundleSlug}
                graphUpdateTrigger={graphUpdateTrigger}
                onBundleNodeContextMenu={handleBundleNodeContextMenu}
                isBundlePreviewOnlyActive={isBundlePreviewOnlyActive}
                bundlePreviewHover={bundlePreviewHover}
                isFolderBasedBundle={isFolderBasedBundle}
              />
            </div>
          ) : (
            <div className="absolute inset-0">
              <ListView
                displayGraph={currentDisplayGraph}
                entryBundleNodeId={entryBundleNodeId}
                onPageClick={handlePageClick}
                bundleSlug={bundleSlug}
                onBundleNodeContextMenu={handleBundleNodeContextMenu}
                selectedNodeKeys={selectedNodeKeys}
              />
            </div>
          )}
          <div className="absolute top-2 right-2 z-10">
            <BundlePagesToggle
              isActive={isBundlePreviewOnlyActive}
              onToggle={handleBundlePreviewOnlyToggle}
              onHoverStart={activeView === 'graph' ? () => setBundlePreviewHover(true) : undefined}
              onHoverEnd={activeView === 'graph' ? () => setBundlePreviewHover(false) : undefined}
            />
          </div>
          {isEmptyDueToSolo && (
            <EmptySoloCallout onTurnOffSolos={handleTurnOffSolos} />
          )}
        </div>
      </div>
      {isSelectionPanelCollapsed ? (
        <div className="flex w-[40px] flex-shrink-0 border-l bg-white">
          <button
            onClick={() => onSelectionPanelCollapseChange(false)}
            className="flex items-center justify-center w-full hover:bg-gray-100 focus:outline-none"
          >
            <div className="transform -rotate-90 whitespace-nowrap text-gray-500">
              Selected
            </div>
          </button>
        </div>
      ) : (
        <ResizableSidebar
          side="right"
          defaultWidth={320}
          minWidth={260}
          maxWidth={560}
          storageKey="bundleEditorSelectionSidebarWidth"
          ariaLabel="Resize selected pages sidebar"
          testId="selection-sidebar"
          className="flex bg-white"
        >
          <BundleNodeSelectionSidebar
            selectedNodeKeys={selectedNodeKeys}
            graph={graph}
            onClose={() => onSelectionPanelCollapseChange(true)}
            onSelectedNodeKeysChange={onSelectedNodeKeysChange}
            onTrackPage={handleTrackPage}
            onBlacklistPage={handleBlacklistPage}
            onTrackSelected={handleTrackSelected}
            onBlacklistSelected={handleBlacklistSelected}
            isEffectivelySensitive={page => currentDisplayGraph.getDisplayNode(page.bundleNodeKey)?.isEffectivelySensitive ?? false}
            onUpdatePageConfig={handleUpdatePageConfig}
            onDeletePageConfigKey={handleDeletePageConfigKey}
            onPreviewPage={onPreviewPage}
            hasDraftChanges={hasDraftChanges}
            onMarkSensitive={handleMarkSensitive}
            obsidianInfo={obsidianInfo}
          />
        </ResizableSidebar>
      )}

      {/* Right-click context menu for pages */}
      {contextMenuPage && (() => {
        const page = graph.getNode(contextMenuPage.bundleNodeKey);
        if (!page) return null;
        return (
          <BundleNodeContextMenu
            page={page}
            graph={graph}
            position={{ x: contextMenuPage.x, y: contextMenuPage.y }}
            onClose={() => setContextMenuPage(null)}
            onTrackPage={handleTrackPage}
            onBlacklistPage={handleBlacklistPage}
            onPreviewPage={onPreviewPage}
            hasDraftChanges={hasDraftChanges}
            onSelectedNodeKeysChange={onSelectedNodeKeysChange}
            onMarkSensitive={handleMarkSensitive}
            obsidianInfo={obsidianInfo}
          />
        );
      })()}

      {/* Orphaned pages modal */}
      <Modal
        isOpen={isOrphansModalOpen}
        onClose={() => setIsOrphansModalOpen(false)}
        title="Orphaned Pages"
        className="max-w-4xl w-full"
      >
        <OrphansView
          orphanConfigs={orphanConfigs}
          onRemoveConfig={onRemoveOrphanConfig}
          onRemoveAllConfigs={onRemoveAllOrphanConfigs}
        />
      </Modal>

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

export default BundleNodeTabs;
