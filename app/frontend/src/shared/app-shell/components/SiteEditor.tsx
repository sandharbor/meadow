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
import { Graph, IEdge } from '../../../../../shared_code/types/graph';
import { ISiteNode } from '../../../../../shared_code/types/ISiteNode.js';
import SiteNodeTabs from '../../../areas/site/curation/components/SiteNodeTabs';
import VersionsModal from '../../site-management/VersionsModal';
import SiteLogsModal from './SiteLogsModal';
import SinglePagePreviewCallout, { useSinglePagePreviewCallout } from '../../../areas/site/review/components/calloutModals/SinglePagePreviewCallout';
import CreateOrEditSiteModal from '../../../areas/sites/components/CreateOrEditSiteModal';
import PreviewPublishModal from './PreviewPublishModal';
import type { OpenKnowledgeFormatSettings } from '../../../areas/site/generation/components/open-knowledge-format/OpenKnowledgeFormatSettingsModal';
import { useFilterState, createUntrackedNodeSelector } from '../../../areas/site/curation/types/filters';
import type { SiteNodeConfig } from '../../../../../shared_code/types/siteNodeConfig';
import { nodeConfigMatchesNode, siteNodeLocatorKey, getOrphanNodeConfigs } from '../../../../../shared_code/utils/siteNodeConfigUtils';
import { applySensitiveFromApiData, applyNodeConfigsToNodes, buildNodeConfigs } from '../../../../../shared_code/utils/siteNodeConfigUtils';
import { API_BASE_URL } from '../../utils/apiConfig';
import { getActiveFrontendProvider } from '../../publishing-provider-host/providerRegistry';
import { fetchSiteEditData, SiteEditData } from '../../utils/siteApi';
import { useParams, useSearchParams } from 'react-router-dom';
import { logger } from '../../utils/logger';
import { openExternal } from '../../utils/openExternal';
import { DisabledTooltip } from '../../components/DisabledTooltip';
import DeleteSiteModal from '../../site-management/DeleteSiteModal';

const SiteEditor: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [filters, setFilters, reloadCustomFilters] = useFilterState(slug || '');
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const [siteNodeConfigs, setSiteNodeConfigs] = useState<SiteNodeConfig[] | null>(null);
  const [entrySiteNodeId, setEntrySiteNodeId] = useState<string | null>(null);
  const [defaultTraversalSiteNodeId, setDefaultTraversalSiteNodeId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [isSelectionPanelCollapsed, setIsSelectionPanelCollapsed] = useState(true);
  const [selectedNodeKeys, setSelectedNodeKeys] = useState<Set<string>>(new Set());
  const [configChangeTrigger, setConfigChangeTrigger] = useState(0);

  // Preview/Publish modal state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isModalBusy, setIsModalBusy] = useState(false);
  const [previewStartPage, setPreviewStartPage] = useState<{ title: string; sourceGraphSubdirectory?: string } | undefined>();
  const [previewModalTab, setPreviewModalTab] = useState<'sitePreview' | 'changes' | 'customization' | 'localExport' | 'publish' | 'advanced'>('sitePreview'); // customization kept for URL param backward compat
  const [hooksHaveErrors, setHooksHaveErrors] = useState(false); // Track if hooks have load errors

  // Version management state
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [hasPublishedVersions, setHasPublishedVersions] = useState(false);


  // Single page preview warning callout state
  const [isSinglePageWarningOpen, setIsSinglePageWarningOpen] = useState(false);
  const { dismissed: calloutPreviewSinglePageDismissed, setDismissed: setCalloutPreviewSinglePageDismissed } = useSinglePagePreviewCallout();

  // Graph loading error state
  const [graphError, setGraphError] = useState<string | null>(null);

  // Site logs modal state
  const [isSiteLogsModalOpen, setIsSiteLogsModalOpen] = useState(false);
  const [siteGuid, setSiteGuid] = useState<string | null>(null);

  // Site menu dropdown state
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const siteMenuRef = useRef<HTMLDivElement>(null);

  // Delete site modal state
  const [isDeleteSiteModalOpen, setIsDeleteSiteModalOpen] = useState(false);

  // Edit site modal state
  const [isEditSiteModalOpen, setIsEditSiteModalOpen] = useState(false);
  const [siteToEdit, setSiteToEdit] = useState<SiteEditData | null>(null);
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

      if (ncPreviewModalTab && ['sitePreview', 'changes', 'customization', 'localExport', 'publish', 'advanced'].includes(ncPreviewModalTab)) {
        setPreviewModalTab(ncPreviewModalTab as 'sitePreview' | 'changes' | 'customization' | 'localExport' | 'publish' | 'advanced');
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

  // Site-level overrides (inherit by default)
  const [siteGenerationBreadcrumbsSetting, setSiteGenerationBreadcrumbsSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationBacklinksSetting, setSiteGenerationBacklinksSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationTagsSetting, setSiteGenerationTagsSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationSearchSetting, setSiteGenerationSearchSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationHoverPreviewSetting, setSiteGenerationHoverPreviewSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationFolderNavigationSetting, setSiteGenerationFolderNavigationSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationSourcesExportSetting, setSiteGenerationSourcesExportSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationOpenKnowledgeFormatSetting, setSiteGenerationOpenKnowledgeFormatSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationSpacedRepetitionSetting, setSiteGenerationSpacedRepetitionSetting] = useState<OverrideSetting>('inherit');
  const [siteGenerationSpacedRepetitionTags, setSiteGenerationSpacedRepetitionTags] = useState<string[] | null>(null);

  // Check draft status
  const checkDraftStatus = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await fetch(`${API_BASE_URL}/sites/${slug}/curation/site-config-draft-status`);
      const data = await response.json();
      setHasDraftChanges(data.hasChanges);
    } catch (error) {
      logger.error('Failed to check draft status:', error);
    }
  }, [slug]);

  // Auto-reload working graph when config changes
  const reloadWorkingGraph = useCallback(() => {
    setConfigChangeTrigger(prev => prev + 1);
  }, []);

  // Check if site has published versions
  const checkPublishedVersions = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await fetch(`${API_BASE_URL}/sites/${slug}/review/versions`);
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
      const response = await fetch(`${API_BASE_URL}/sites/${slug}/generation/hooks/load-status`);
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

  // Close site menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (siteMenuRef.current && !siteMenuRef.current.contains(event.target as Node)) {
        setIsSiteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenVersions = () => {
    setIsVersionsModalOpen(true);
  };

  const handleCloseVersions = () => {
    setIsVersionsModalOpen(false);
  };

  const handleVersionUpdate = () => {
    checkPublishedVersions();
  };

  const handleOpenWebsite = async () => {
    if (!slug) return;
    const provider = await getActiveFrontendProvider();
    if (!provider?.fetchPublishedUrl) return;
    try {
      const url = await provider.fetchPublishedUrl(slug);
      await openExternal(url, 'siteEditor');
    } catch (err) {
      logger.error('Failed to get website URL:', err);
      alert(`Failed to get website URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleEditSite = async () => {
    if (!slug) return;
    try {
      const { siteEditData, directories: dirs } = await fetchSiteEditData(slug);
      setSiteToEdit(siteEditData);
      setDirectories(dirs);
      setIsEditSiteModalOpen(true);
    } catch (err) {
      logger.error('Failed to load site for editing:', err);
      alert('Failed to load site data for editing');
    }
  };

  useEffect(() => {
    checkPublishedVersions();
  }, [checkPublishedVersions]);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE_URL}/sites/${slug}/config`)
      .then(res => res.json())
      .then(config => {
        setSiteGuid(typeof config.siteGuid === 'string' ? config.siteGuid : null);
        setEntrySiteNodeId(typeof config.entrySiteNodeId === 'string' ? config.entrySiteNodeId : null);
        setDefaultTraversalSiteNodeId(typeof config.defaultTraversalSiteNodeId === 'string' ? config.defaultTraversalSiteNodeId : null);

        // Load site publish option overrides (missing => inherit)
        const toSetting = (v: unknown): OverrideSetting =>
          v === undefined ? 'inherit' : v === false ? 'disabled' : 'enabled';

        setSiteGenerationBreadcrumbsSetting(toSetting(config.generationBreadcrumbsEnabled));
        setSiteGenerationBacklinksSetting(toSetting(config.generationBacklinksEnabled));
        setSiteGenerationTagsSetting(toSetting(config.generationTagsEnabled));
        setSiteGenerationSearchSetting(toSetting(config.generationSearchEnabled));
        setSiteGenerationHoverPreviewSetting(toSetting(config.generationHoverPreviewEnabled));
        setSiteGenerationFolderNavigationSetting(toSetting(config.generationFolderNavigationEnabled));
        setSiteGenerationSourcesExportSetting(toSetting(config.generationMarkdownZipEnabled));
        setSiteGenerationOpenKnowledgeFormatSetting(toSetting(config.generationOpenKnowledgeFormatEnabled));
        setSiteGenerationSpacedRepetitionSetting(toSetting(config.generationSpacedRepetitionEnabled));
        setSiteGenerationSpacedRepetitionTags(
          Array.isArray(config.generationSpacedRepetitionTags)
            ? config.generationSpacedRepetitionTags.filter((tag: unknown): tag is string => typeof tag === 'string')
            : null
        );

        setConfigLoaded(true);
      })
      .catch(() => {
        logger.error('Failed to load site config');
        setConfigLoaded(true);
      });
  }, [slug]);

  // Load global publish option defaults from app config
  useEffect(() => {
    fetch(`${API_BASE_URL}/app-config`)
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
    const url = `${API_BASE_URL}/sites/${slug || ''}/curation/working-graph${frontierParam}`;
    logger.debug('Fetching working graph from:', url);
    fetch(url)
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
        const nodesWithSensitive = applySensitiveFromApiData(data.nodes as ISiteNode[]);
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

    const currentNodeKeys = new Set<string>(graph.getAllNodes().map(node => node.siteNodeKey));
    const filteredSelection = new Set(
      Array.from(selectedNodeKeys).filter(siteNodeKey => currentNodeKeys.has(siteNodeKey))
    );
    
    // Only update if the selection actually changed
    if (filteredSelection.size !== selectedNodeKeys.size) {
      setSelectedNodeKeys(filteredSelection);
    }
  }, [graph, updateTrigger, selectedNodeKeys]); // Include selectedNodeKeys in dependencies

  useEffect(() => {
    if (!graph) return;
    // Fetch site-config after graph is loaded
    fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`)
      .then(res => res.json())
      .then(data => {
        const loadedSiteNodeConfigs: SiteNodeConfig[] = Array.isArray(data.configs) ? data.configs : [];
        setSiteNodeConfigs(loadedSiteNodeConfigs);
        // Check draft status after loading config
        checkDraftStatus();
      })
      .catch(err => {
        logger.error('Failed to load site-config:', err);
      });
  }, [graph, slug, checkDraftStatus, entrySiteNodeId]);

  useEffect(() => {
    if (!graph || !siteNodeConfigs) return;
    // Apply config to site nodes using the shared utility.
    const allNodes = graph.getAllNodes();
    applyNodeConfigsToNodes(allNodes, siteNodeConfigs);

    // Update the graph instance for each node that has a config applied
    // This triggers graph change listeners
    siteNodeConfigs.forEach(cfg => {
      const node = allNodes.find(candidate =>
        nodeConfigMatchesNode(cfg, candidate.siteNodeName, candidate.sourceGraphSubdirectory, candidate.fileType)
      );
      if (node) {
        graph.updateNode(node.siteNodeKey, node);
      }
    });
    // Force update to reflect changes
    setUpdateTrigger(prev => prev + 1);
  }, [graph, siteNodeConfigs]);

  // Auto-select page from CLI target if available
  useEffect(() => {
    if (!graph) return;

    const autoSelectPageName = sessionStorage.getItem('autoSelectPageName');
    if (autoSelectPageName) {
      // Find the page by title
      const pageToSelect = graph.getAllNodes().find(p => p.siteNodeName === autoSelectPageName);
      if (pageToSelect) {
        logger.debug(`Auto-selecting page: ${autoSelectPageName}`);
        setSelectedNodeKeys(new Set([pageToSelect.siteNodeKey]));
        // Clear the session storage after selection
        sessionStorage.removeItem('autoSelectPageName');
      }
    }
  }, [graph]);

  // Build merged configs from current site pages + preserved configs for pages not in view
  // (for example if you have a different traversal page selected)
  const buildMergedNodeConfigs = useCallback((): SiteNodeConfig[] => {
    if (!graph) return [];

    const allNodes = graph.getAllNodes();
    const currentConfigs = buildNodeConfigs(allNodes);

    // Preserve configs for pages not in current view
    // Use nodeConfigMatchesNode for comparison to handle the case where old configs don't have fileType
    // (nodeConfigMatchesNode treats undefined fileType as "match any", matching the backend's behavior)
    const nodesWithConfig = allNodes.filter(node => node.conf);
    const preservedConfigs = (siteNodeConfigs || []).filter(cfg => {
      const hasMatchingNodeInCurrentGraph = nodesWithConfig.some(node =>
        nodeConfigMatchesNode(cfg, node.siteNodeName, node.sourceGraphSubdirectory, node.fileType)
      );
      return !hasMatchingNodeInCurrentGraph;
    });

    return [...currentConfigs, ...preservedConfigs].sort((a, b) => a.siteNodeName.localeCompare(b.siteNodeName));
  }, [graph, siteNodeConfigs]);

  const buildMergedNodeConfigsFrom = useCallback((configs: SiteNodeConfig[]): SiteNodeConfig[] => {
    if (!graph) return configs;

    const allNodes = graph.getAllNodes();
    const currentConfigs = buildNodeConfigs(allNodes);
    const nodesWithConfig = allNodes.filter(node => node.conf);
    const preservedConfigs = configs.filter(cfg => {
      const hasMatchingNodeInCurrentGraph = nodesWithConfig.some(node =>
        nodeConfigMatchesNode(cfg, node.siteNodeName, node.sourceGraphSubdirectory, node.fileType)
      );
      return !hasMatchingNodeInCurrentGraph;
    });

    return [...currentConfigs, ...preservedConfigs].sort((a, b) => a.siteNodeName.localeCompare(b.siteNodeName));
  }, [graph]);

  const persistUpdatedSiteNodeConfigs = useCallback(async (updatedSiteNodeConfigs: SiteNodeConfig[]) => {
    setSiteNodeConfigs(updatedSiteNodeConfigs);

    const nodeConfigs = buildMergedNodeConfigsFrom(updatedSiteNodeConfigs);
    try {
      if (!hasDraftChanges) {
        const response = await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nodeConfigs, isDraft: false })
        });
        if (!response.ok) throw new Error('Failed to save configuration');
        checkDraftStatus();
      } else {
        await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configs: nodeConfigs, isDraft: true })
        });
        checkDraftStatus();
      }
    } catch (error) {
      logger.error('Error saving site page configuration:', error);
    }
  }, [buildMergedNodeConfigsFrom, hasDraftChanges, slug, checkDraftStatus]);

  const handleRemoveOrphanConfig = useCallback(async (config: SiteNodeConfig) => {
    if (!graph || !siteNodeConfigs) return;

    const keyToRemove = siteNodeLocatorKey(config);
    const updatedSiteNodeConfigs = siteNodeConfigs.filter(cfg =>
      siteNodeLocatorKey(cfg) !== keyToRemove
    );
    await persistUpdatedSiteNodeConfigs(updatedSiteNodeConfigs);
  }, [graph, siteNodeConfigs, persistUpdatedSiteNodeConfigs]);

  const handleRemoveAllOrphanConfigs = useCallback(async () => {
    if (!graph || !siteNodeConfigs) return;

    const orphanKeys = new Set(
      getOrphanNodeConfigs(siteNodeConfigs, graph.getAllNodes()).map(cfg =>
        siteNodeLocatorKey(cfg)
      )
    );
    if (orphanKeys.size === 0) return;

    const updatedSiteNodeConfigs = siteNodeConfigs.filter(cfg =>
      !orphanKeys.has(siteNodeLocatorKey(cfg))
    );
    await persistUpdatedSiteNodeConfigs(updatedSiteNodeConfigs);
  }, [graph, siteNodeConfigs, persistUpdatedSiteNodeConfigs]);

  // Save current configuration to draft
  const saveToDraft = useCallback(async () => {
    if (!graph) return;
    const nodeConfigs = buildMergedNodeConfigs();
    try {
      await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`, {
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
      const response = await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: nodeConfigs, isDraft: false })
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      logger.info('Configuration saved successfully!');
      checkDraftStatus();

      // Copy tracked pages and commit changes after saving configuration
      // This endpoint also commits both config and tracked content together
      const trackedNodes = graph.getAllNodes()
        .filter(page => page.tracked && !page.blacklisted)
        .map(page => ({
          sourceGraphSubdirectory: page.sourceGraphSubdirectory,
          title: page.siteNodeName,
          fileType: page.fileType
        }));

      try {
        const copyResponse = await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/copy-tracked-pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackedNodes, commitMessage })
        });

        if (copyResponse.ok) {
          const copyData = await copyResponse.json();
          logger.info('Tracked pages copied:', copyData.message);
          if (copyData.errors && copyData.errors.length > 0) {
            logger.warn('Some files had errors:', copyData.errors);
          }
        } else {
          logger.error('Failed to copy tracked pages');
        }
      } catch (copyError) {
        logger.error('Error copying tracked pages:', copyError);
      }
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
      await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config-draft`, {
        method: 'DELETE'
      });

      // Re-fetch the committed config (not draft) and apply directly
      // This avoids a full graph reload which would cause a flash of 0-tracked state
      const response = await fetch(`${API_BASE_URL}/sites/${slug || ''}/curation/site-config`);
      const data = await response.json();
      const committedConfigs: SiteNodeConfig[] = Array.isArray(data.configs) ? data.configs : [];

      // Reset all pages to untracked/unblacklisted before applying committed config
      if (graph) {
        const allNodes = graph.getAllNodes();
        allNodes.forEach(page => {
          page.tracked = false;
          page.blacklisted = false;
          page.conf = undefined;
        });
      }

      // Setting siteNodeConfigs triggers the config apply effect which will
      // re-apply the committed config to the (now-reset) pages
      setSiteNodeConfigs(committedConfigs);
      checkDraftStatus();
      // Reload the working graph so the backend re-traverses with the restored
      // config (e.g. restored outlinks_depth brings back pages that were removed).
      reloadWorkingGraph();
    } catch (error) {
      logger.error('Error undoing changes:', error);
    }
  };

  const handlePreviewPage = (siteNodeKey: string) => {
    if (!slug || !graph) return;
    if (isModalBusy) return;

    const page = graph.getNode(siteNodeKey);
    if (!page) return;

    const pageTitle = page.data?.title || page.label || siteNodeKey;
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

  // Update a site-level override (inherit/enable/disable) - just persist to server
  const handleSiteGenerationOptionChange = async (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'search' | 'hoverPreview' | 'folderNavigation' | 'sourcesExport' | 'openKnowledgeFormat' | 'spacedRepetition', setting: OverrideSetting) => {
    if (!slug) return;

    // Update local state immediately
    if (option === 'breadcrumbs') {
      setSiteGenerationBreadcrumbsSetting(setting);
    } else if (option === 'backlinks') {
      setSiteGenerationBacklinksSetting(setting);
      if (setting === 'disabled') {
        setSiteGenerationTagsSetting('disabled');
      }
    } else if (option === 'tags') {
      setSiteGenerationTagsSetting(setting);
    } else if (option === 'search') {
      setSiteGenerationSearchSetting(setting);
    } else if (option === 'folderNavigation') {
      setSiteGenerationFolderNavigationSetting(setting);
    } else if (option === 'sourcesExport') {
      setSiteGenerationSourcesExportSetting(setting);
    } else if (option === 'openKnowledgeFormat') {
      setSiteGenerationOpenKnowledgeFormatSetting(setting);
    } else if (option === 'spacedRepetition') {
      setSiteGenerationSpacedRepetitionSetting(setting);
    } else {
      setSiteGenerationHoverPreviewSetting(setting);
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
      await fetch(`${API_BASE_URL}/sites/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });
    } catch (error) {
      logger.error('Failed to update site publish option:', error);
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
      const res = await fetch(`${API_BASE_URL}/generation/options`, {
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
      const res = await fetch(`${API_BASE_URL}/generation/options`, {
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

  const handleSiteSrsTagsChange = async (tags: string[] | null) => {
    if (!slug) return;
    setSiteGenerationSpacedRepetitionTags(tags);

    try {
      await fetch(`${API_BASE_URL}/sites/${slug}/generation/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationSpacedRepetitionTags: tags })
      });
    } catch (error) {
      logger.error('Failed to update site SRS tags:', error);
    }
  };

  const handleSiteOkfLogSettingsChange = async (settings: OpenKnowledgeFormatSettings) => {
    if (!slug) return;

    try {
      await fetch(`${API_BASE_URL}/sites/${slug}/generation/options`, {
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
      logger.error('Failed to update site OKF log settings:', error);
    }
  };

  const handleSiteOkfEnable = async (setting: OverrideSetting, settings: OpenKnowledgeFormatSettings) => {
    if (!slug) return;
    setSiteGenerationOpenKnowledgeFormatSetting(setting);

    try {
      await fetch(`${API_BASE_URL}/sites/${slug}/generation/options`, {
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
      logger.error('Failed to enable site OKF settings:', error);
    }
  };

  const handleClosePublishModal = () => {
    setIsPublishModalOpen(false);
    setPreviewStartPage(undefined);
    setPreviewModalTab('sitePreview');
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
            <h2 className="text-lg font-semibold text-danger-700 mb-2">Failed to Load Site</h2>
            <pre className="text-sm text-danger-600 bg-danger-100 p-4 rounded overflow-auto whitespace-pre-wrap mb-4">
              {graphError}
            </pre>
            <div className="flex space-x-4">
              <button
                onClick={() => { window.location.href = '/'; }}
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
    return <div className="w-full h-screen flex items-center justify-center">Loading site editor...</div>;
  }

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      <div className="flex border-b border-neutral-200 items-center py-2 flex-shrink-0">
        <button
          className="ml-4 px-3 py-1 bg-neutral-200 rounded hover:bg-neutral-300"
          onClick={() => { window.location.href = '/'; }}
        >
          ← Sites
        </button>
        <div className="ml-6 mr-8 font-medium">
          <span className="text-main-700">{slug}</span>
        </div>
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
          {/* Site menu dropdown */}
          <div className="relative" ref={siteMenuRef}>
            <button
              onClick={() => setIsSiteMenuOpen(!isSiteMenuOpen)}
              className="px-2 py-1 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded"
              title="Site options"
            >
              ⋯
            </button>
            {isSiteMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <DisabledTooltip disabled={!hasPublishedVersions} tooltip="Available after you publish" className="block">
                    <button
                      onClick={() => {
                        handleOpenWebsite();
                        setIsSiteMenuOpen(false);
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
                      handleEditSite();
                      setIsSiteMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    Edit site
                  </button>
                  <button
                    onClick={() => {
                      setIsSiteLogsModalOpen(true);
                      setIsSiteMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    Site logs
                  </button>
                  <div className="border-t border-neutral-200 my-1"></div>
                  <button
                    onClick={() => {
                      setIsDeleteSiteModalOpen(true);
                      setIsSiteMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete site
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
        siteGenerationOptions={{
          breadcrumbsSetting: siteGenerationBreadcrumbsSetting,
          backlinksSetting: siteGenerationBacklinksSetting,
          tagsSetting: siteGenerationTagsSetting,
          searchSetting: siteGenerationSearchSetting,
          hoverPreviewSetting: siteGenerationHoverPreviewSetting,
          folderNavigationSetting: siteGenerationFolderNavigationSetting,
          sourcesExportSetting: siteGenerationSourcesExportSetting,
          openKnowledgeFormatSetting: siteGenerationOpenKnowledgeFormatSetting,
          spacedRepetitionSetting: siteGenerationSpacedRepetitionSetting,
        }}
        globalSrsTags={globalGenerationSpacedRepetitionTags}
        siteSrsTagsOverride={siteGenerationSpacedRepetitionTags}
        onGlobalGenerationOptionChange={handleGlobalGenerationOptionChange}
        onSiteGenerationOptionChange={handleSiteGenerationOptionChange}
        onGlobalSrsTagsChange={handleGlobalSrsTagsChange}
        onSiteSrsTagsChange={handleSiteSrsTagsChange}
        onSiteOkfLogSettingsChange={handleSiteOkfLogSettingsChange}
        onSiteOkfEnable={handleSiteOkfEnable}
        hasPublishedVersions={hasPublishedVersions}
        onOpenVersionsModal={() => {
          setIsPublishModalOpen(false);
          handleOpenVersions();
        }}
        onBusyChange={setIsModalBusy}
        onAuthError={() => {/* Access code handling is now built into the modal */}}
        onPublishSuccess={checkPublishedVersions}
        untrackedNodeCount={getUntrackedNodeCount()}
        onShowUntrackedNodes={handleShowUntrackedNodes}
        onTabChange={setPreviewModalTab}
        initialTab={previewModalTab}
        hooksHaveErrors={hooksHaveErrors}
      />}

      {/* Versions Modal */}
      <VersionsModal
        isOpen={isVersionsModalOpen}
        onClose={handleCloseVersions}
        siteSlug={slug || ''}
        onVersionUpdate={handleVersionUpdate}
        openedFromPreview={isPublishModalOpen}
      />

      {/* Single Page Preview Warning Callout */}
      <SinglePagePreviewCallout
        isOpen={isSinglePageWarningOpen}
        onClose={() => setIsSinglePageWarningOpen(false)}
        onContinue={handleSinglePageWarningContinue}
      />

      <SiteLogsModal
        isOpen={isSiteLogsModalOpen}
        onClose={() => setIsSiteLogsModalOpen(false)}
        initialSiteGuidFilter={siteGuid ? `[site ${siteGuid}]` : null}
      />

      {/* Delete Site Modal */}
      <DeleteSiteModal
        isOpen={isDeleteSiteModalOpen}
        onClose={() => setIsDeleteSiteModalOpen(false)}
        onDeleted={() => { window.location.href = '/'; }}
        siteSlug={slug || ''}
        isPublished={hasPublishedVersions}
      />

      {/* Edit Site Modal */}
      <CreateOrEditSiteModal
        isOpen={isEditSiteModalOpen}
        onClose={() => {
          setIsEditSiteModalOpen(false);
          setSiteToEdit(null);
        }}
        mode="edit"
        editSite={siteToEdit}
        onSuccess={() => {
          setIsEditSiteModalOpen(false);
          setSiteToEdit(null);
        }}
        directories={directories}
      />

      <div className="flex-1 overflow-hidden">
        <SiteNodeTabs
          graph={graph}
          entrySiteNodeId={entrySiteNodeId ?? undefined}
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
          siteSlug={slug || ''}
          onRefresh={() => setConfigChangeTrigger(prev => prev + 1)}
          untrackedNodeCount={getUntrackedNodeCount()}
          siteNodeConfigs={siteNodeConfigs}
          protectedSiteNodeIds={new Set([entrySiteNodeId, defaultTraversalSiteNodeId].filter((id): id is string => id !== null))}
          onRemoveOrphanConfig={handleRemoveOrphanConfig}
          onRemoveAllOrphanConfigs={handleRemoveAllOrphanConfigs}
        />
      </div>
    </div>
  );
};

export default SiteEditor; 
