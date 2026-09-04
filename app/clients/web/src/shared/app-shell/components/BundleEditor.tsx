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

/* global alert */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiRequest } from '../../utils/apiClient';
import { Graph, IEdge } from '../../../../../../contracts/types/graph';
import { IBundleNode } from '../../../../../../contracts/types/IBundleNode.js';
import BundleNodeTabs from '../../../areas/bundle/curation/components/BundleNodeTabs';
import BundleLogsModal from './BundleLogsModal';
import SinglePagePreviewCallout, { useSinglePagePreviewCallout } from '../../../areas/bundle/review/components/calloutModals/SinglePagePreviewCallout';
import CreateOrEditBundleModal from '../../../areas/bundles/components/CreateOrEditBundleModal';
import PreviewPublishModal from './PreviewPublishModal';
import type { OpenKnowledgeFormatSettings } from '../../../areas/bundle/generation/components/open-knowledge-format/OpenKnowledgeFormatSettingsModal';
import { useFilterState, createUntrackedNodeSelector } from '../../../areas/bundle/curation/types/filters';
import type { BundleNodeConfig } from '../../../../../../contracts/types/bundleNodeConfig';
import { nodeConfigMatchesNode, bundleNodeLocatorKey, getOrphanNodeConfigs } from '../../../../../../shared_code/utils/bundleNodeConfigUtils';
import { applySensitiveFromApiData, applyNodeConfigsToNodes, buildNodeConfigs } from '../../../../../../shared_code/utils/bundleNodeConfigUtils';
import { getActiveFrontendProvider } from '../../publishing-provider-host/providerRegistry';
import { fetchBundleEditData, BundleEditData } from '../../utils/bundleApi';
import { useParams, useSearchParams } from 'react-router-dom';
import { logger } from '../../utils/logger';
import { openExternal } from '../../utils/openExternal';
import { useAppNavigation } from '../../utils/appNavigation';
import { DisabledTooltip } from '../../components/DisabledTooltip';
import DeleteBundleModal from '../../bundle-management/DeleteBundleModal';
import RenameBundleModal from '../../bundle-management/RenameBundleModal';

const BundleEditor: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigateInApp = useAppNavigation('bundleEditor');
  const [searchParams, setSearchParams] = useSearchParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [filters, setFilters, reloadCustomFilters] = useFilterState(slug || '');
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const [bundleNodeConfigs, setBundleNodeConfigs] = useState<BundleNodeConfig[] | null>(null);
  const [entryBundleNodeId, setEntryBundleNodeId] = useState<string | null>(null);
  const [defaultTraversalBundleNodeId, setDefaultTraversalBundleNodeId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [isSelectionPanelCollapsed, setIsSelectionPanelCollapsed] = useState(true);
  const [selectedNodeKeys, setSelectedNodeKeys] = useState<Set<string>>(new Set());
  const [configChangeTrigger, setConfigChangeTrigger] = useState(0);

  // Preview/Publish modal state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isModalBusy, setIsModalBusy] = useState(false);
  const [previewStartPage, setPreviewStartPage] = useState<{ title: string; sourceGraphSubdirectory?: string } | undefined>();
  const [previewModalTab, setPreviewModalTab] = useState<'bundlePreview' | 'changes' | 'versions' | 'customization' | 'localExport' | 'publish' | 'advanced'>('bundlePreview'); // customization kept for URL param backward compat
  const [hooksHaveErrors, setHooksHaveErrors] = useState(false); // Track if hooks have load errors

  const [hasPublishedVersions, setHasPublishedVersions] = useState(false);


  // Single page preview warning callout state
  const [isSinglePageWarningOpen, setIsSinglePageWarningOpen] = useState(false);
  const { dismissed: calloutPreviewSinglePageDismissed, setDismissed: setCalloutPreviewSinglePageDismissed } = useSinglePagePreviewCallout();

  // Graph loading error state
  const [graphError, setGraphError] = useState<string | null>(null);
  const [isRecalculatingGraph, setIsRecalculatingGraph] = useState(false);

  // Bundle logs modal state
  const [isBundleLogsModalOpen, setIsBundleLogsModalOpen] = useState(false);
  const [bundleGuid, setBundleGuid] = useState<string | null>(null);

  // Bundle menu dropdown state
  const [isBundleMenuOpen, setIsBundleMenuOpen] = useState(false);
  const bundleMenuRef = useRef<HTMLDivElement>(null);

  // Delete bundle modal state
  const [isDeleteBundleModalOpen, setIsDeleteBundleModalOpen] = useState(false);
  const [isRenameBundleModalOpen, setIsRenameBundleModalOpen] = useState(false);

  // Edit bundle modal state
  const [isEditBundleModalOpen, setIsEditBundleModalOpen] = useState(false);
  const [bundleToEdit, setBundleToEdit] = useState<BundleEditData | null>(null);
  const [directories, setDirectories] = useState<string[]>([]);

  // Derive frontier state from filter
  const frontierFilter = filters.find(f => f.id === 'frontier-filter');
  const viewFrontierEnabled = frontierFilter?.enabled ?? false;
  const frontierDepth = frontierFilter?.thresholdValue ?? 1;

  // Helper to update URL params for navigational components (nc prefix)
  const updateNcParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      }
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Track if we've already processed the initial URL params
  const initialUrlParamsProcessed = useRef(false);

  // Effect to read URL params on initial load and trigger preview modal if ncPreviewModal is present
  useEffect(() => {
    if (initialUrlParamsProcessed.current) return;

    const ncPreviewModal = searchParams.get('ncPreviewModal');
    const ncPreviewModalTab = searchParams.get('ncPreviewModalTab');

    if (ncPreviewModal === '1') {
      initialUrlParamsProcessed.current = true;

      if (ncPreviewModalTab && ['bundlePreview', 'changes', 'versions', 'customization', 'localExport', 'publish', 'advanced'].includes(ncPreviewModalTab)) {
        setPreviewModalTab(ncPreviewModalTab as 'bundlePreview' | 'changes' | 'versions' | 'customization' | 'localExport' | 'publish' | 'advanced');
      }

      if (slug) {
        setTimeout(() => {
          setIsPublishModalOpen(true);
        }, 100);
      }
    }
  }, [slug, searchParams]);

  // Effect to sync URL params when modal state changes
  useEffect(() => {
    if (!initialUrlParamsProcessed.current && searchParams.get('ncPreviewModal') === '1') {
      return;
    }

    if (isPublishModalOpen) {
      updateNcParams({
        ncPreviewModal: '1',
        ncPreviewModalTab: previewModalTab,
      });
    } else {
      updateNcParams({
        ncPreviewModal: null,
        ncPreviewModalTab: null,
      });
    }
  }, [isPublishModalOpen, previewModalTab, updateNcParams, searchParams]);

  type OverrideSetting = 'inherit' | 'enabled' | 'disabled';

  // Global publish option defaults (loaded from app config; default true)
  const [globalGenerationBreadcrumbsEnabled, setGlobalGenerationBreadcrumbsEnabled] = useState(true);
  const [globalGenerationBacklinksEnabled, setGlobalGenerationBacklinksEnabled] = useState(true);
  const [globalGenerationTagsEnabled, setGlobalGenerationTagsEnabled] = useState(true);
  const [globalGenerationSearchEnabled, setGlobalGenerationSearchEnabled] = useState(true);
  const [globalGenerationHoverPreviewEnabled, setGlobalGenerationHoverPreviewEnabled] = useState(false);
  const [globalGenerationFolderNavigationEnabled, setGlobalGenerationFolderNavigationEnabled] = useState(false);
  const [globalGenerationSourcesExportEnabled, setGlobalGenerationSourcesExportEnabled] = useState(false);
  const [globalGenerationOpenKnowledgeFormatEnabled, setGlobalGenerationOpenKnowledgeFormatEnabled] = useState(false);
  const [globalGenerationSpacedRepetitionEnabled, setGlobalGenerationSpacedRepetitionEnabled] = useState(false);
  const [globalGenerationSpacedRepetitionTags, setGlobalGenerationSpacedRepetitionTags] = useState<string[]>([]);

  // Bundle-level overrides (inherit by default)
  const [bundleGenerationBreadcrumbsSetting, setBundleGenerationBreadcrumbsSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationBacklinksSetting, setBundleGenerationBacklinksSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationTagsSetting, setBundleGenerationTagsSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationSearchSetting, setBundleGenerationSearchSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationHoverPreviewSetting, setBundleGenerationHoverPreviewSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationFolderNavigationSetting, setBundleGenerationFolderNavigationSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationSourcesExportSetting, setBundleGenerationSourcesExportSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationOpenKnowledgeFormatSetting, setBundleGenerationOpenKnowledgeFormatSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationSpacedRepetitionSetting, setBundleGenerationSpacedRepetitionSetting] = useState<OverrideSetting>('inherit');
  const [bundleGenerationSpacedRepetitionTags, setBundleGenerationSpacedRepetitionTags] = useState<string[] | null>(null);

  // Check draft status
  const checkDraftStatus = useCallback(async (signal?: AbortSignal) => {
    if (!slug) return;
    try {
      const response = await apiRequest(
        `bundles/${slug}/curation/bundle-config-draft-status`,
        { signal },
      );
      const data = await response.json();
      if (signal?.aborted) return;
      setHasDraftChanges(data.hasChanges);
    } catch (error) {
      if (signal?.aborted) return;
      logger.error('Failed to check draft status:', error);
    }
  }, [slug]);

  // Auto-reload working graph when config changes
  const reloadWorkingGraph = useCallback(() => {
    setIsRecalculatingGraph(true);
    setConfigChangeTrigger(prev => prev + 1);
  }, []);

  const refreshBundleNodeConfigs = useCallback(() => {
    if (!slug) return;
    apiRequest(`bundles/${slug}/curation/bundle-config`)
      .then(res => res.json())
      .then(data => {
        setBundleNodeConfigs(Array.isArray(data.configs) ? data.configs : []);
      })
      .catch(error => {
        logger.error('Failed to refresh bundle-config:', error);
      });
  }, [slug]);

  // Check if bundle has published versions
  const checkPublishedVersions = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await apiRequest(`bundles/${slug}/review/versions`);
      if (response.ok) {
        const data = await response.json();
        setHasPublishedVersions(data.versions && data.versions.length > 0);
      }
    } catch (error) {
      logger.error('Failed to check published versions:', error);
    }
  }, [slug]);

  // Check hooks load status for error indicator
  const checkHooksLoadStatus = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await apiRequest(`bundles/${slug}/generation/hooks/load-status`);
      if (response.ok) {
        const data = await response.json();
        setHooksHaveErrors(!data.allLoaded);
      }
    } catch (error) {
      logger.error('Failed to check hooks load status:', error);
      setHooksHaveErrors(false);
    }
  }, [slug]);

  // Check hooks load status on mount and when graph changes
  useEffect(() => {
    checkHooksLoadStatus();
  }, [checkHooksLoadStatus, configChangeTrigger]);

  // Close bundle menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bundleMenuRef.current && !bundleMenuRef.current.contains(event.target as Node)) {
        setIsBundleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenWebsite = async () => {
    if (!slug) return;
    const provider = await getActiveFrontendProvider();
    if (!provider?.fetchPublishedUrl) return;
    try {
      const url = await provider.fetchPublishedUrl(slug);
      await openExternal(url, 'bundleEditor');
    } catch (err) {
      logger.error('Failed to get website URL:', err);
      alert(`Failed to get website URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleEditBundle = async () => {
    if (!slug) return;
    try {
      const { bundleEditData, directories: dirs } = await fetchBundleEditData(slug);
      setBundleToEdit(bundleEditData);
      setDirectories(dirs);
      setIsEditBundleModalOpen(true);
    } catch (err) {
      logger.error('Failed to load bundle for editing:', err);
      alert('Failed to load bundle data for editing');
    }
  };

  useEffect(() => {
    checkPublishedVersions();
  }, [checkPublishedVersions]);

  useEffect(() => {
    if (!slug) return;
    apiRequest(`bundles/${slug}/config`)
      .then(res => res.json())
      .then(config => {
        setBundleGuid(typeof config.bundleGuid === 'string' ? config.bundleGuid : null);
        setEntryBundleNodeId(typeof config.entryBundleNodeId === 'string' ? config.entryBundleNodeId : null);
        setDefaultTraversalBundleNodeId(typeof config.defaultTraversalBundleNodeId === 'string' ? config.defaultTraversalBundleNodeId : null);

        // Load bundle publish option overrides (missing => inherit)
        const toSetting = (v: unknown): OverrideSetting =>
          v === undefined ? 'inherit' : v === false ? 'disabled' : 'enabled';

        setBundleGenerationBreadcrumbsSetting(toSetting(config.generationBreadcrumbsEnabled));
        setBundleGenerationBacklinksSetting(toSetting(config.generationBacklinksEnabled));
        setBundleGenerationTagsSetting(toSetting(config.generationTagsEnabled));
        setBundleGenerationSearchSetting(toSetting(config.generationSearchEnabled));
        setBundleGenerationHoverPreviewSetting(toSetting(config.generationHoverPreviewEnabled));
        setBundleGenerationFolderNavigationSetting(toSetting(config.generationFolderNavigationEnabled));
        setBundleGenerationSourcesExportSetting(toSetting(config.generationMarkdownZipEnabled));
        setBundleGenerationOpenKnowledgeFormatSetting(toSetting(config.generationOpenKnowledgeFormatEnabled));
        setBundleGenerationSpacedRepetitionSetting(toSetting(config.generationSpacedRepetitionEnabled));
        setBundleGenerationSpacedRepetitionTags(
          Array.isArray(config.generationSpacedRepetitionTags)
            ? config.generationSpacedRepetitionTags.filter((tag: unknown): tag is string => typeof tag === 'string')
            : null
        );

        setConfigLoaded(true);
      })
      .catch(() => {
        logger.error('Failed to load bundle config');
        setConfigLoaded(true);
      });
  }, [slug]);

  // Load global publish option defaults from app config
  useEffect(() => {
    apiRequest(`app-config`)
      .then(res => res.json())
      .then((cfg: {
        generationBreadcrumbsEnabled?: boolean;
        generationBacklinksEnabled?: boolean;
        generationTagsEnabled?: boolean;
        generationSearchEnabled?: boolean;
        generationHoverPreviewEnabled?: boolean;
        generationFolderNavigationEnabled?: boolean;
        generationMarkdownZipEnabled?: boolean;
        generationOpenKnowledgeFormatEnabled?: boolean;
        generationSpacedRepetitionEnabled?: boolean;
        generationSpacedRepetitionTags?: string[];
      }) => {
        setGlobalGenerationBreadcrumbsEnabled(cfg.generationBreadcrumbsEnabled !== false);
        setGlobalGenerationBacklinksEnabled(cfg.generationBacklinksEnabled !== false);
        setGlobalGenerationTagsEnabled(cfg.generationTagsEnabled !== false);
        setGlobalGenerationSearchEnabled(cfg.generationSearchEnabled !== false);
        setGlobalGenerationHoverPreviewEnabled(cfg.generationHoverPreviewEnabled === true);
        setGlobalGenerationFolderNavigationEnabled(cfg.generationFolderNavigationEnabled === true);
        setGlobalGenerationSourcesExportEnabled(cfg.generationMarkdownZipEnabled === true);
        setGlobalGenerationOpenKnowledgeFormatEnabled(cfg.generationOpenKnowledgeFormatEnabled === true);
        setGlobalGenerationSpacedRepetitionEnabled(cfg.generationSpacedRepetitionEnabled === true);
        setGlobalGenerationSpacedRepetitionTags(
          Array.isArray(cfg.generationSpacedRepetitionTags)
            ? cfg.generationSpacedRepetitionTags.filter((tag: unknown): tag is string => typeof tag === 'string')
            : []
        );
      })
      .catch(() => {
        // Defaults stay true
      });
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    // Clear previous error when starting a new fetch
    setGraphError(null);
    const frontierParam = viewFrontierEnabled ? `?frontierDepth=${frontierDepth}` : '';
    const url = `bundles/${slug || ''}/curation/working-graph${frontierParam}`;
    logger.debug('Fetching working graph from:', url);
    apiRequest(url)
      .then(res => {
        if (!res.ok) {
          // Parse error response and extract message
          return res.json().then(data => {
            const errorMessage = data.message || data.error || `Failed to load working graph (status ${res.status})`;
            throw new Error(errorMessage);
          }).catch(jsonErr => {
            // If JSON parsing fails, try text
            if (jsonErr instanceof Error && jsonErr.message !== 'Unexpected token') {
              throw jsonErr; // Re-throw if it's our custom error
            }
            return res.text().then(text => {
              throw new Error(`Failed to load working graph. Status: ${res.status}. ${text}`);
            });
          });
        }
        return res.json();
      })
      .then(data => {
        if (!data.nodes || !data.edges) {
          logger.error('Received data does not contain nodes or edges:', data);
          // Potentially set an error state or throw an error to be caught
          throw new Error('Invalid data structure received from server.');
        }
        const g = new Graph();
        const nodesWithSensitive = applySensitiveFromApiData(data.nodes as IBundleNode[]);
        nodesWithSensitive.forEach(node => g.addNode(node));
        (data.edges as IEdge[]).forEach(edge => g.addEdge(edge));
        // Store full source graph link data (including pages outside working graph)
        g.setLinkSourceData(
          data.allInlinkSources || {},
          data.allOutlinkTargets || {}
        );
        setGraph(g);
        setGraphError(null); // Clear error on success
      })
      .catch(err => {
        logger.error('Failed to load working graph:', err);
        setGraphError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setIsRecalculatingGraph(false);
      });
  }, [slug, configLoaded, configChangeTrigger, viewFrontierEnabled, frontierDepth]);

  useEffect(() => {
    if (!graph) return;
    const handleGraphChange = () => {
      setUpdateTrigger(prev => prev + 1);
    };
    graph.subscribe(handleGraphChange);
    return () => {
      graph.unsubscribe(handleGraphChange);
    };
  }, [graph]);

  // Filter out selected pages that are no longer in the graph
  useEffect(() => {
    if (!graph || selectedNodeKeys.size === 0) return;

    const currentNodeKeys = new Set<string>(graph.getAllNodes().map(node => node.bundleNodeKey));
    const filteredSelection = new Set(
      Array.from(selectedNodeKeys).filter(bundleNodeKey => currentNodeKeys.has(bundleNodeKey))
    );
    
    // Only update if the selection actually changed
    if (filteredSelection.size !== selectedNodeKeys.size) {
      setSelectedNodeKeys(filteredSelection);
    }
  }, [graph, updateTrigger, selectedNodeKeys]); // Include selectedNodeKeys in dependencies

  useEffect(() => {
    if (!graph) return;
    const controller = new AbortController();
    // Fetch bundle-config after graph is loaded
    apiRequest(
      `bundles/${slug || ''}/curation/bundle-config`,
      { signal: controller.signal },
    )
      .then(res => res.json())
      .then(data => {
        if (controller.signal.aborted) return;
        const loadedBundleNodeConfigs: BundleNodeConfig[] = Array.isArray(data.configs) ? data.configs : [];
        setBundleNodeConfigs(loadedBundleNodeConfigs);
        // Check draft status after loading config
        void checkDraftStatus(controller.signal);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        logger.error('Failed to load bundle-config:', err);
      });
    return () => controller.abort();
  }, [graph, slug, checkDraftStatus, entryBundleNodeId]);

  useEffect(() => {
    if (!graph || !bundleNodeConfigs) return;
    // Apply config to bundle nodes using the shared utility.
    const allNodes = graph.getAllNodes();
    applyNodeConfigsToNodes(allNodes, bundleNodeConfigs);

    // Update the graph instance for each node that has a config applied
    // This triggers graph change listeners
    bundleNodeConfigs.forEach(cfg => {
      const node = allNodes.find(candidate =>
        nodeConfigMatchesNode(
          cfg,
          candidate.bundleNodeName,
          candidate.sourceGraphSubdirectory,
          candidate.fileType,
          candidate.bundleNodeKind,
          candidate.bundleNodeId,
        )
      );
      if (node) {
        graph.updateNode(node.bundleNodeKey, node);
      }
    });
    // Force update to reflect changes
    setUpdateTrigger(prev => prev + 1);
  }, [graph, bundleNodeConfigs]);

  // Auto-select page from CLI target if available
  useEffect(() => {
    if (!graph) return;

    const autoSelectPageName = sessionStorage.getItem('autoSelectPageName');
    if (autoSelectPageName) {
      // Find the page by title
      const pageToSelect = graph.getAllNodes().find(p => p.bundleNodeName === autoSelectPageName);
      if (pageToSelect) {
        logger.debug(`Auto-selecting page: ${autoSelectPageName}`);
        setSelectedNodeKeys(new Set([pageToSelect.bundleNodeKey]));
        // Clear the session storage after selection
        sessionStorage.removeItem('autoSelectPageName');
      }
    }
  }, [graph]);

  // Build merged configs from current bundle pages + preserved configs for pages not in view
  // (for example if you have a different traversal page selected)
  const buildMergedNodeConfigs = useCallback((): BundleNodeConfig[] => {
    if (!graph) return [];

    const allNodes = graph.getAllNodes();
    const currentConfigs = buildNodeConfigs(allNodes);

    // Preserve configs for pages not in current view
    // Use nodeConfigMatchesNode for comparison to handle the case where old configs don't have fileType
    // (nodeConfigMatchesNode treats undefined fileType as "match any", matching the backend's behavior)
    const preservedConfigs = (bundleNodeConfigs || []).filter(cfg => {
      const hasMatchingNodeInCurrentGraph = allNodes.some(node =>
        nodeConfigMatchesNode(
          cfg,
          node.bundleNodeName,
          node.sourceGraphSubdirectory,
          node.fileType,
          node.bundleNodeKind,
          node.bundleNodeId,
        )
      );
      return !hasMatchingNodeInCurrentGraph;
    });

    return [...currentConfigs, ...preservedConfigs].sort((a, b) => a.bundleNodeName.localeCompare(b.bundleNodeName));
  }, [graph, bundleNodeConfigs]);

  const buildMergedNodeConfigsFrom = useCallback((configs: BundleNodeConfig[]): BundleNodeConfig[] => {
    if (!graph) return configs;

    const allNodes = graph.getAllNodes();
    const currentConfigs = buildNodeConfigs(allNodes);
    const preservedConfigs = configs.filter(cfg => {
      const hasMatchingNodeInCurrentGraph = allNodes.some(node =>
        nodeConfigMatchesNode(
          cfg,
          node.bundleNodeName,
          node.sourceGraphSubdirectory,
          node.fileType,
          node.bundleNodeKind,
          node.bundleNodeId,
        )
      );
      return !hasMatchingNodeInCurrentGraph;
    });

    return [...currentConfigs, ...preservedConfigs].sort((a, b) => a.bundleNodeName.localeCompare(b.bundleNodeName));
  }, [graph]);

  const persistUpdatedBundleNodeConfigs = useCallback(async (updatedBundleNodeConfigs: BundleNodeConfig[]) => {
    setBundleNodeConfigs(updatedBundleNodeConfigs);

    const nodeConfigs = buildMergedNodeConfigsFrom(updatedBundleNodeConfigs);
    try {
      if (!hasDraftChanges) {
        const response = await apiRequest(`bundles/${slug || ''}/curation/bundle-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nodeConfigs, isDraft: false })
        });
        if (!response.ok) throw new Error('Failed to save configuration');
        checkDraftStatus();
      } else {
        await apiRequest(`bundles/${slug || ''}/curation/bundle-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nodeConfigs, isDraft: true })
        });
        checkDraftStatus();
      }
    } catch (error) {
      logger.error('Error saving bundle page configuration:', error);
    }
  }, [buildMergedNodeConfigsFrom, hasDraftChanges, slug, checkDraftStatus]);

  const handleRemoveOrphanConfig = useCallback(async (config: BundleNodeConfig) => {
    if (!graph || !bundleNodeConfigs) return;

    const keyToRemove = bundleNodeLocatorKey(config);
    const updatedBundleNodeConfigs = bundleNodeConfigs.filter(cfg =>
      bundleNodeLocatorKey(cfg) !== keyToRemove
    );
    await persistUpdatedBundleNodeConfigs(updatedBundleNodeConfigs);
  }, [graph, bundleNodeConfigs, persistUpdatedBundleNodeConfigs]);

  const handleRemoveAllOrphanConfigs = useCallback(async () => {
    if (!graph || !bundleNodeConfigs) return;

    const orphanKeys = new Set(
      getOrphanNodeConfigs(bundleNodeConfigs, graph.getAllNodes()).map(cfg =>
        bundleNodeLocatorKey(cfg)
      )
    );
    if (orphanKeys.size === 0) return;

    const updatedBundleNodeConfigs = bundleNodeConfigs.filter(cfg =>
      !orphanKeys.has(bundleNodeLocatorKey(cfg))
    );
    await persistUpdatedBundleNodeConfigs(updatedBundleNodeConfigs);
  }, [graph, bundleNodeConfigs, persistUpdatedBundleNodeConfigs]);

  // Save current configuration to draft
  const saveToDraft = useCallback(async () => {
    if (!graph) return;
    const nodeConfigs = buildMergedNodeConfigs();
    try {
      await apiRequest(`bundles/${slug || ''}/curation/bundle-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: nodeConfigs, isDraft: true })
      });
      checkDraftStatus();
      reloadWorkingGraph();
    } catch (error) {
      logger.error('Error saving draft configuration:', error);
    }
  }, [graph, buildMergedNodeConfigs, slug, checkDraftStatus, reloadWorkingGraph]);

  // Shared implementation for saving the full config and committing it.
  // When commitMessage is provided, it's used instead of the default ("auto-save" path).
  const saveAndCommitConfig = useCallback(async (commitMessage?: string) => {
    if (!graph) return;
    const nodeConfigs = buildMergedNodeConfigs();
    try {
      const response = await apiRequest(`bundles/${slug || ''}/curation/bundle-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: nodeConfigs, isDraft: false, commitMessage })
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      logger.info('Configuration saved successfully!');
      checkDraftStatus();
    } catch (error) {
      logger.error('Error saving configuration:', error);
    }
  }, [graph, buildMergedNodeConfigs, slug, checkDraftStatus]);

  const handleSaveConfig = useCallback(async () => {
    await saveAndCommitConfig();
  }, [saveAndCommitConfig]);

  // Auto-save used by simple operations (track page, track all, blacklist single page).
  // Writes directly to the committed config (bypassing the draft file) so the
  // Save button never flickers in and out for these straightforward actions.
  const handleAutoSaveConfig = useCallback(async () => {
    await saveAndCommitConfig('auto-save config on simple change');
  }, [saveAndCommitConfig]);

  // Check for localStorage flag to save config after reload
  useEffect(() => {
    if (localStorage.getItem('shouldSaveConfigAfterReload') === 'true') {
      localStorage.removeItem('shouldSaveConfigAfterReload');
      // Wait a bit for component to fully initialize before saving
      const timer = setTimeout(() => {
        handleSaveConfig();
      }, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [handleSaveConfig]);

  const handleUndoChanges = async () => {
    try {
      // Delete the draft
      await apiRequest(`bundles/${slug || ''}/curation/bundle-config-draft`, {
        method: 'DELETE'
      });

      // Re-fetch the committed config (not draft) and apply directly
      // This avoids a full graph reload which would cause a flash of 0-tracked state
      const response = await apiRequest(`bundles/${slug || ''}/curation/bundle-config`);
      const data = await response.json();
      const committedConfigs: BundleNodeConfig[] = Array.isArray(data.configs) ? data.configs : [];

      // Reset all pages to untracked/unblacklisted before applying committed config
      if (graph) {
        const allNodes = graph.getAllNodes();
        allNodes.forEach(page => {
          page.tracked = false;
          page.blacklisted = false;
          page.conf = undefined;
        });
      }

      // Setting bundleNodeConfigs triggers the config apply effect which will
      // re-apply the committed config to the (now-reset) pages
      setBundleNodeConfigs(committedConfigs);
      checkDraftStatus();
      // Reload the working graph so the backend re-traverses with the restored
      // config (e.g. restored outlinks_depth brings back pages that were removed).
      reloadWorkingGraph();
    } catch (error) {
      logger.error('Error undoing changes:', error);
    }
  };

  const handlePreviewPage = (bundleNodeKey: string) => {
    if (!slug || !graph) return;
    if (isModalBusy) return;

    const page = graph.getNode(bundleNodeKey);
    if (!page) return;

    const pageTitle = page.data?.title || page.label || bundleNodeKey;
    setPreviewStartPage({ title: pageTitle, sourceGraphSubdirectory: page.sourceGraphSubdirectory });
    setIsPublishModalOpen(true);
  };

  // Check if only the traversal-start node is tracked. updateTrigger is needed
  // because the graph object reference does not change when node data updates.
  const isOnlyTraversalStartNodeTracked = useMemo(() => {
    if (!graph) return false;
    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) return false;

    const traversalStartNode = allNodes.find(node => node.depth === 0);
    if (!traversalStartNode || !traversalStartNode.tracked) return false;

    const otherTrackedNodes = allNodes.filter(
      node => node.depth !== 0 && node.tracked
    );
    return otherTrackedNodes.length === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, updateTrigger]);

  const handlePreview = () => {
    if (isModalBusy) return;
    // Show warning if only initial page is tracked and user hasn't dismissed the warning before
    if (isOnlyTraversalStartNodeTracked && !calloutPreviewSinglePageDismissed) {
      setIsSinglePageWarningOpen(true);
      return;
    }
    setPreviewStartPage(undefined);
    setIsPublishModalOpen(true);
  };

  const handleSinglePageWarningContinue = () => {
    setIsSinglePageWarningOpen(false);
    setCalloutPreviewSinglePageDismissed(true);
    setPreviewStartPage(undefined);
    setIsPublishModalOpen(true);
  };

  const settingToPayload = (setting: OverrideSetting): boolean | null => {
    if (setting === 'inherit') return null;
    return setting === 'enabled';
  };

  // Update a bundle-level override (inherit/enable/disable) - just persist to server
  const handleBundleGenerationOptionChange = async (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'search' | 'hoverPreview' | 'folderNavigation' | 'sourcesExport' | 'openKnowledgeFormat' | 'spacedRepetition', setting: OverrideSetting) => {
    if (!slug) return;

    // Update local state immediately
    if (option === 'breadcrumbs') {
      setBundleGenerationBreadcrumbsSetting(setting);
    } else if (option === 'backlinks') {
      setBundleGenerationBacklinksSetting(setting);
      if (setting === 'disabled') {
        setBundleGenerationTagsSetting('disabled');
      }
    } else if (option === 'tags') {
      setBundleGenerationTagsSetting(setting);
    } else if (option === 'search') {
      setBundleGenerationSearchSetting(setting);
    } else if (option === 'folderNavigation') {
      setBundleGenerationFolderNavigationSetting(setting);
    } else if (option === 'sourcesExport') {
      setBundleGenerationSourcesExportSetting(setting);
    } else if (option === 'openKnowledgeFormat') {
      setBundleGenerationOpenKnowledgeFormatSetting(setting);
    } else if (option === 'spacedRepetition') {
      setBundleGenerationSpacedRepetitionSetting(setting);
    } else {
      setBundleGenerationHoverPreviewSetting(setting);
    }

    const payloadMap: Record<string, Record<string, boolean | null>> = {
      breadcrumbs: { generationBreadcrumbsEnabled: settingToPayload(setting) },
      backlinks: {
        generationBacklinksEnabled: settingToPayload(setting),
        ...(setting === 'disabled' ? { generationTagsEnabled: false } : {})
      },
      tags: { generationTagsEnabled: settingToPayload(setting) },
      search: { generationSearchEnabled: settingToPayload(setting) },
      hoverPreview: { generationHoverPreviewEnabled: settingToPayload(setting) },
      folderNavigation: { generationFolderNavigationEnabled: settingToPayload(setting) },
      sourcesExport: { generationMarkdownZipEnabled: settingToPayload(setting) },
      openKnowledgeFormat: { generationOpenKnowledgeFormatEnabled: settingToPayload(setting) },
      spacedRepetition: { generationSpacedRepetitionEnabled: settingToPayload(setting) },
    };
    const updatePayload = payloadMap[option];

    try {
      await apiRequest(`bundles/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
    } catch (error) {
      logger.error('Failed to update bundle publish option:', error);
    }
  };

  // Update a global default - just persist to server
  const handleGlobalGenerationOptionChange = async (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'search' | 'hoverPreview' | 'folderNavigation' | 'sourcesExport' | 'openKnowledgeFormat' | 'spacedRepetition', enabled: boolean) => {
    // Update local state immediately
    if (option === 'breadcrumbs') setGlobalGenerationBreadcrumbsEnabled(enabled);
    if (option === 'backlinks') setGlobalGenerationBacklinksEnabled(enabled);
    if (option === 'tags') setGlobalGenerationTagsEnabled(enabled);
    if (option === 'search') setGlobalGenerationSearchEnabled(enabled);
    if (option === 'hoverPreview') setGlobalGenerationHoverPreviewEnabled(enabled);
    if (option === 'folderNavigation') setGlobalGenerationFolderNavigationEnabled(enabled);
    if (option === 'sourcesExport') setGlobalGenerationSourcesExportEnabled(enabled);
    if (option === 'openKnowledgeFormat') setGlobalGenerationOpenKnowledgeFormatEnabled(enabled);
    if (option === 'spacedRepetition') setGlobalGenerationSpacedRepetitionEnabled(enabled);

    const payloadMap: Record<string, Record<string, boolean>> = {
      breadcrumbs: { generationBreadcrumbsEnabled: enabled },
      backlinks: { generationBacklinksEnabled: enabled, ...(enabled ? {} : { generationTagsEnabled: false }) },
      tags: { generationTagsEnabled: enabled },
      search: { generationSearchEnabled: enabled },
      hoverPreview: { generationHoverPreviewEnabled: enabled },
      folderNavigation: { generationFolderNavigationEnabled: enabled },
      sourcesExport: { generationMarkdownZipEnabled: enabled },
      openKnowledgeFormat: { generationOpenKnowledgeFormatEnabled: enabled },
      spacedRepetition: { generationSpacedRepetitionEnabled: enabled },
    };
    const updatePayload = payloadMap[option];

    try {
      const res = await apiRequest(`generation/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
      if (res.ok) {
        const data = await res.json();
        const cfg = data.settings as {
          generationBreadcrumbsEnabled?: boolean;
          generationBacklinksEnabled?: boolean;
          generationTagsEnabled?: boolean;
          generationSearchEnabled?: boolean;
          generationHoverPreviewEnabled?: boolean;
          generationFolderNavigationEnabled?: boolean;
          generationMarkdownZipEnabled?: boolean;
          generationOpenKnowledgeFormatEnabled?: boolean;
          generationSpacedRepetitionEnabled?: boolean;
          generationSpacedRepetitionTags?: string[];
        };
        setGlobalGenerationBreadcrumbsEnabled(cfg.generationBreadcrumbsEnabled !== false);
        setGlobalGenerationBacklinksEnabled(cfg.generationBacklinksEnabled !== false);
        setGlobalGenerationTagsEnabled(cfg.generationTagsEnabled !== false);
        setGlobalGenerationSearchEnabled(cfg.generationSearchEnabled !== false);
        setGlobalGenerationHoverPreviewEnabled(cfg.generationHoverPreviewEnabled === true);
        setGlobalGenerationFolderNavigationEnabled(cfg.generationFolderNavigationEnabled === true);
        setGlobalGenerationSourcesExportEnabled(cfg.generationMarkdownZipEnabled === true);
        setGlobalGenerationOpenKnowledgeFormatEnabled(cfg.generationOpenKnowledgeFormatEnabled === true);
        setGlobalGenerationSpacedRepetitionEnabled(cfg.generationSpacedRepetitionEnabled === true);
        setGlobalGenerationSpacedRepetitionTags(
          Array.isArray(cfg.generationSpacedRepetitionTags)
            ? cfg.generationSpacedRepetitionTags.filter((tag: unknown): tag is string => typeof tag === 'string')
            : []
        );
      }
    } catch (error) {
      logger.error('Failed to update global publish option:', error);
    }
  };

  const handleGlobalSrsTagsChange = async (tags: string[]) => {
    setGlobalGenerationSpacedRepetitionTags(tags);

    try {
      const res = await apiRequest(`generation/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationSpacedRepetitionTags: tags })
      });
      if (res.ok) {
        const data = await res.json();
        const cfg = data.settings as {
          generationSpacedRepetitionTags?: string[];
        };
        setGlobalGenerationSpacedRepetitionTags(
          Array.isArray(cfg.generationSpacedRepetitionTags)
            ? cfg.generationSpacedRepetitionTags.filter((tag: unknown): tag is string => typeof tag === 'string')
            : []
        );
      }
    } catch (error) {
      logger.error('Failed to update global SRS tags:', error);
    }
  };

  const handleBundleSrsTagsChange = async (tags: string[] | null) => {
    if (!slug) return;
    setBundleGenerationSpacedRepetitionTags(tags);

    try {
      await apiRequest(`bundles/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationSpacedRepetitionTags: tags })
      });
    } catch (error) {
      logger.error('Failed to update bundle SRS tags:', error);
    }
  };

  const handleBundleOkfLogSettingsChange = async (settings: OpenKnowledgeFormatSettings) => {
    if (!slug) return;

    try {
      await apiRequest(`bundles/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationOpenKnowledgeFormatIndexMode: settings.index.mode,
          generationOpenKnowledgeFormatIndexSourcePath: settings.index.sourceGraphPath,
          generationOpenKnowledgeFormatLogMode: settings.log.mode,
          generationOpenKnowledgeFormatLogSourcePath: settings.log.sourceGraphPath,
        })
      });
    } catch (error) {
      logger.error('Failed to update bundle OKF log settings:', error);
    }
  };

  const handleBundleOkfEnable = async (setting: OverrideSetting, settings: OpenKnowledgeFormatSettings) => {
    if (!slug) return;
    setBundleGenerationOpenKnowledgeFormatSetting(setting);

    try {
      await apiRequest(`bundles/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationOpenKnowledgeFormatEnabled: settingToPayload(setting),
          generationOpenKnowledgeFormatIndexMode: settings.index.mode,
          generationOpenKnowledgeFormatIndexSourcePath: settings.index.sourceGraphPath,
          generationOpenKnowledgeFormatLogMode: settings.log.mode,
          generationOpenKnowledgeFormatLogSourcePath: settings.log.sourceGraphPath,
        })
      });
    } catch (error) {
      logger.error('Failed to enable bundle OKF settings:', error);
    }
  };

  const handleClosePublishModal = () => {
    setIsPublishModalOpen(false);
    setPreviewStartPage(undefined);
    setPreviewModalTab('bundlePreview');
  };


  // Helper function to count untracked pages
  const getUntrackedNodeCount = useCallback(() => {
    if (!graph) return 0;
    const untrackedSelector = createUntrackedNodeSelector();
    const untrackedNodeKeys = untrackedSelector.select(graph);
    return untrackedNodeKeys.size;
  }, [graph]);

  // Handler to close modal and enable untracked pages filter in solo mode
  const handleShowUntrackedNodes = () => {
    // Enable untracked pages filter in solo mode with labels turned on
    const updatedFilters = filters.map(filter => {
      if (filter.id === 'untracked-filter') {
        const hasShowTitles = filter.actions.some(a => a.type === 'show_titles');
        const actions = hasShowTitles
          ? filter.actions
          : [...filter.actions, { type: 'show_titles' as const }];
        return { ...filter, enabled: true, isSolo: true, actions };
      } else {
        return { ...filter, isSolo: false }; // Disable solo mode for other filters
      }
    });
    setFilters(updatedFilters);

    // Close the modal
    handleClosePublishModal();
  };


  if (!graph) {
    if (graphError) {
      return (
        <div className="w-full h-screen flex flex-col items-center justify-center p-8">
          <div className="max-w-2xl w-full bg-danger-50 border border-danger-300 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-danger-700 mb-2">Failed to Load Bundle</h2>
            <pre className="text-sm text-danger-600 bg-danger-100 p-4 rounded overflow-auto whitespace-pre-wrap mb-4">
              {graphError}
            </pre>
            <div className="flex space-x-4">
              <button
                onClick={() => navigateInApp({ page: 'bundle-list' })}
                className="px-4 py-2 bg-neutral-200 rounded hover:bg-neutral-300"
              >
                ← Back to Home
              </button>
              <button
                onClick={() => {
                  setGraphError(null);
                  setConfigChangeTrigger(prev => prev + 1);
                }}
                className="px-4 py-2 bg-btn-standard-normal text-btn-standard-text rounded hover:bg-btn-standard-hover"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <div className="w-full h-screen flex items-center justify-center">Loading bundle editor...</div>;
  }

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      <div className="flex border-b border-neutral-200 items-center py-2 flex-shrink-0">
        <button
          className="ml-4 px-3 py-1 bg-neutral-200 rounded hover:bg-neutral-300"
          onClick={() => navigateInApp({ page: 'bundle-list' })}
        >
          ← Bundles
        </button>
        <div className="ml-6 mr-8 font-medium">
          <span className="text-main-700">{slug}</span>
        </div>
        {isRecalculatingGraph && (
          <div
            role="status"
            className="flex items-center gap-2 text-xs text-neutral-500"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-main-500 animate-pulse" />
            Recalculating graph…
          </div>
        )}
        {/* Middle Section - spacer */}
        <div className="flex-1" />
        
        <div className="ml-auto mr-4 flex items-center space-x-2">
          {hasDraftChanges && (
            <div className="flex space-x-2">
              <button
                className="px-3 py-1 bg-success-500 text-white text-sm rounded hover:bg-success-600"
                onClick={handleSaveConfig}
              >
                Save
              </button>
              <button
                className="px-3 py-1 bg-neutral-500 text-white text-sm rounded hover:bg-neutral-600"
                onClick={handleUndoChanges}
              >
                Undo
              </button>
            </div>
          )}
          {/* Bundle menu dropdown */}
          <div className="relative" ref={bundleMenuRef}>
            <button
              onClick={() => setIsBundleMenuOpen(!isBundleMenuOpen)}
              className="px-2 py-1 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded"
              title="Bundle options"
            >
              ⋯
            </button>
            {isBundleMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <DisabledTooltip disabled={!hasPublishedVersions} tooltip="Available after you publish" className="block">
                    <button
                      onClick={() => {
                        handleOpenWebsite();
                        setIsBundleMenuOpen(false);
                      }}
                      disabled={!hasPublishedVersions}
                      className={`w-full px-3 py-2 text-left text-sm ${
                        !hasPublishedVersions
                          ? 'text-neutral-400 cursor-not-allowed'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      Open in Browser
                    </button>
                  </DisabledTooltip>
                  <button
                    onClick={() => {
                      setIsRenameBundleModalOpen(true);
                      setIsBundleMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    Rename bundle
                  </button>
                  <button
                    onClick={() => {
                      handleEditBundle();
                      setIsBundleMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    Edit bundle details
                  </button>
                  <button
                    onClick={() => {
                      setIsBundleLogsModalOpen(true);
                      setIsBundleMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    Bundle logs
                  </button>
                  <div className="border-t border-neutral-200 my-1"></div>
                  <button
                    onClick={() => {
                      setIsDeleteBundleModalOpen(true);
                      setIsBundleMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete bundle
                  </button>
                </div>
              </div>
            )}
          </div>
          <DisabledTooltip disabled={hasDraftChanges} tooltip="Save your unsaved changes before previewing" position="below" align="right">
            <button
              className={`px-4 py-2 text-btn-standard-text text-sm rounded font-medium ${
                isModalBusy || hasDraftChanges
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-btn-standard-normal hover:bg-btn-standard-hover'
              }`}
              onClick={handlePreview}
              disabled={isModalBusy || hasDraftChanges}
            >
              {isModalBusy ? 'Loading...' : 'Preview'}
            </button>
          </DisabledTooltip>
        </div>
      </div>

      {/* Preview/Publish Modal — unmounted when closed so all state resets naturally */}
      {isPublishModalOpen && <PreviewPublishModal
        onClose={handleClosePublishModal}
        slug={slug || ''}
        startPage={previewStartPage}
        globalGenerationOptions={{
          breadcrumbsEnabled: globalGenerationBreadcrumbsEnabled,
          backlinksEnabled: globalGenerationBacklinksEnabled,
          tagsEnabled: globalGenerationTagsEnabled,
          searchEnabled: globalGenerationSearchEnabled,
          hoverPreviewEnabled: globalGenerationHoverPreviewEnabled,
          folderNavigationEnabled: globalGenerationFolderNavigationEnabled,
          sourcesExportEnabled: globalGenerationSourcesExportEnabled,
          openKnowledgeFormatEnabled: globalGenerationOpenKnowledgeFormatEnabled,
          spacedRepetitionEnabled: globalGenerationSpacedRepetitionEnabled,
        }}
        bundleGenerationOptions={{
          breadcrumbsSetting: bundleGenerationBreadcrumbsSetting,
          backlinksSetting: bundleGenerationBacklinksSetting,
          tagsSetting: bundleGenerationTagsSetting,
          searchSetting: bundleGenerationSearchSetting,
          hoverPreviewSetting: bundleGenerationHoverPreviewSetting,
          folderNavigationSetting: bundleGenerationFolderNavigationSetting,
          sourcesExportSetting: bundleGenerationSourcesExportSetting,
          openKnowledgeFormatSetting: bundleGenerationOpenKnowledgeFormatSetting,
          spacedRepetitionSetting: bundleGenerationSpacedRepetitionSetting,
        }}
        globalSrsTags={globalGenerationSpacedRepetitionTags}
        bundleSrsTagsOverride={bundleGenerationSpacedRepetitionTags}
        onGlobalGenerationOptionChange={handleGlobalGenerationOptionChange}
        onBundleGenerationOptionChange={handleBundleGenerationOptionChange}
        onGlobalSrsTagsChange={handleGlobalSrsTagsChange}
        onBundleSrsTagsChange={handleBundleSrsTagsChange}
        onBundleOkfLogSettingsChange={handleBundleOkfLogSettingsChange}
        onBundleOkfEnable={handleBundleOkfEnable}
        onBusyChange={setIsModalBusy}
        onAuthError={() => {/* Access code handling is now built into the modal */}}
        onPublishSuccess={checkPublishedVersions}
        untrackedNodeCount={getUntrackedNodeCount()}
        onShowUntrackedNodes={handleShowUntrackedNodes}
        onTabChange={setPreviewModalTab}
        initialTab={previewModalTab}
        hooksHaveErrors={hooksHaveErrors}
      />}

      {/* Single Page Preview Warning Callout */}
      <SinglePagePreviewCallout
        isOpen={isSinglePageWarningOpen}
        onClose={() => setIsSinglePageWarningOpen(false)}
        onContinue={handleSinglePageWarningContinue}
      />

      <BundleLogsModal
        isOpen={isBundleLogsModalOpen}
        onClose={() => setIsBundleLogsModalOpen(false)}
        initialBundleGuidFilter={bundleGuid ? `[bundle ${bundleGuid}]` : null}
      />

      {/* Delete Bundle Modal */}
      <DeleteBundleModal
        isOpen={isDeleteBundleModalOpen}
        onClose={() => setIsDeleteBundleModalOpen(false)}
        onDeleted={() => navigateInApp({ page: 'bundle-list' })}
        bundleSlug={slug || ''}
        isPublished={hasPublishedVersions}
      />

      <RenameBundleModal
        isOpen={isRenameBundleModalOpen}
        onClose={() => setIsRenameBundleModalOpen(false)}
        bundleSlug={slug || ''}
        onRenamed={renamedSlug => {
          setIsRenameBundleModalOpen(false);
          navigateInApp({ page: 'bundle', slug: renamedSlug });
        }}
      />

      {/* Edit Bundle Modal */}
      <CreateOrEditBundleModal
        isOpen={isEditBundleModalOpen}
        onClose={() => {
          setIsEditBundleModalOpen(false);
          setBundleToEdit(null);
        }}
        mode="edit"
        editBundle={bundleToEdit}
        onSuccess={() => {
          setIsEditBundleModalOpen(false);
          setBundleToEdit(null);
          reloadWorkingGraph();
        }}
        directories={directories}
      />

      <div className="flex-1 overflow-hidden">
        <BundleNodeTabs
          graph={graph}
          entryBundleNodeId={entryBundleNodeId ?? undefined}
          filters={filters}
          onFiltersChange={setFilters}
          onReloadCustomFilters={reloadCustomFilters}
          graphUpdateTrigger={updateTrigger}
          onConfigChange={saveToDraft}
          onCheckDraftStatus={checkDraftStatus}
          onAutoSave={handleAutoSaveConfig}
          isSelectionPanelCollapsed={isSelectionPanelCollapsed}
          onSelectionPanelCollapseChange={setIsSelectionPanelCollapsed}
          selectedNodeKeys={selectedNodeKeys}
          onSelectedNodeKeysChange={setSelectedNodeKeys}
          onPreviewPage={handlePreviewPage}
          hasDraftChanges={hasDraftChanges}
          bundleSlug={slug || ''}
          onRefresh={reloadWorkingGraph}
          onRefreshNodeConfigs={refreshBundleNodeConfigs}
          untrackedNodeCount={getUntrackedNodeCount()}
          bundleNodeConfigs={bundleNodeConfigs}
          protectedBundleNodeIds={new Set([entryBundleNodeId, defaultTraversalBundleNodeId].filter((id): id is string => id !== null))}
          onRemoveOrphanConfig={handleRemoveOrphanConfig}
          onRemoveAllOrphanConfigs={handleRemoveAllOrphanConfigs}
        />
      </div>
    </div>
  );
};

export default BundleEditor; 
