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
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../../../shared/utils/apiClient';
import { getActiveFrontendProvider } from '../../../shared/publishing-provider-host/providerRegistry';
import { fetchBundles, fetchDirectories, BundleConfigWithSlug } from '../../../shared/utils/bundleApi';
import { FindInBundlesOptions } from '../../../../../shared_code/types/findInBundlesOptions';
import Modal from '../../../shared/components/Modal';
import CreateOrEditBundleModal from './CreateOrEditBundleModal';
import DeleteBundleModal from '../../../shared/bundle-management/DeleteBundleModal';
import { logger } from '../../../shared/utils/logger';
import { openExternal } from '../../../shared/utils/openExternal';
import SelectedFolderRepairModal from './SelectedFolderRepairModal';

type BundleConfig = BundleConfigWithSlug;

type BundleListSortKey =
  | 'default'
  | 'slug'
  | 'bundleCreatedAt'
  | 'bundleUpdatedAt'
  | 'mostRecentPublicationAt'
  | 'archivedAt';

type SortDirection = 'asc' | 'desc';

type SortState = {
  key: BundleListSortKey;
  direction: SortDirection;
};

type CliInstallResult = Awaited<ReturnType<Window['electronAPI']['installCommandLineInterface']>>;

const BUNDLE_LIST_SORT_STORAGE_KEY = 'bundleList.sortState.v1';

const compareStrings = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

// Helper function to highlight matching text
const highlightMatch = (text: string, query: string): React.ReactNode => {
  if (!query.trim() || !text) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <>
      {before}
      <span className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{match}</span>
      {after}
    </>
  );
};

// Check if a bundle matches the search query
const bundleMatchesSearch = (bundle: BundleConfig, query: string): boolean => {
  if (!query.trim()) return true;

  const lowerQuery = query.toLowerCase();
  const slug = (bundle.slug || '').toLowerCase();
  const initialPage = (bundle.entryBundleNodeName || '').toLowerCase();
  const notes = (bundle.bundleNotes || '').toLowerCase();

  return slug.includes(lowerQuery) || initialPage.includes(lowerQuery) || notes.includes(lowerQuery);
};

const parseTime = (value?: string | null): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

const compareNullableNumbers = (a: number | null, b: number | null, direction: SortDirection) => {
  if (a != null && b != null) return direction === 'asc' ? a - b : b - a;
  if (a != null && b == null) return -1; // values come first
  if (a == null && b != null) return 1;
  return 0;
};

// Mirror backend default ordering: provider publication activity, then local updates.
const defaultBackendComparator = (a: BundleConfig, b: BundleConfig) => {
  if (a.error && !b.error) return 1;
  if (!a.error && b.error) return -1;
  if (a.error && b.error) return 0;

  const aPublished = parseTime(a.mostRecentPublicationAt);
  const bPublished = parseTime(b.mostRecentPublicationAt);
  const publishedCmp = compareNullableNumbers(aPublished, bPublished, 'desc');
  if (publishedCmp !== 0) return publishedCmp;

  const aUpdated = parseTime(a.bundleUpdatedAt);
  const bUpdated = parseTime(b.bundleUpdatedAt);
  const updatedCmp = compareNullableNumbers(aUpdated, bUpdated, 'desc');
  if (updatedCmp !== 0) return updatedCmp;

  return 0;
};

const compareByKey = (a: BundleConfig, b: BundleConfig, key: BundleListSortKey, direction: SortDirection) => {
  switch (key) {
    case 'slug': {
      const cmp = compareStrings(a.slug || '', b.slug || '');
      return direction === 'asc' ? cmp : -cmp;
    }
    case 'bundleCreatedAt': {
      return compareNullableNumbers(parseTime(a.bundleCreatedAt), parseTime(b.bundleCreatedAt), direction);
    }
    case 'bundleUpdatedAt': {
      return compareNullableNumbers(parseTime(a.bundleUpdatedAt), parseTime(b.bundleUpdatedAt), direction);
    }
    case 'mostRecentPublicationAt': {
      return compareNullableNumbers(parseTime(a.mostRecentPublicationAt), parseTime(b.mostRecentPublicationAt), direction);
    }
    case 'archivedAt': {
      return compareNullableNumbers(parseTime(a.archivedAt), parseTime(b.archivedAt), direction);
    }
    case 'default':
    default:
      return 0;
  }
};

const formatBundleDate = (value?: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const BundleList: React.FC = () => {
  const location = useLocation();
  const [bundles, setBundles] = useState<BundleConfig[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'archived'>('current');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExampleBundleModalOpen, setIsExampleBundleModalOpen] = useState(false);
  const [isCliInstallModalOpen, setIsCliInstallModalOpen] = useState(false);
  const [isInstallingCli, setIsInstallingCli] = useState(false);
  const [cliInstallResult, setCliInstallResult] = useState<CliInstallResult | null>(null);
  const [isBundleListMenuOpen, setIsBundleListMenuOpen] = useState(false);
  const bundleListMenuRef = useRef<HTMLDivElement>(null);
  const bundleActionMenuRef = useRef<HTMLDivElement>(null);
  const [bundleActionMenu, setBundleActionMenu] = useState<{
    slug: string;
    top: number;
    right: number;
  } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [bundleToRepair, setBundleToRepair] = useState<BundleConfig | null>(null);
  const [bundleToDelete, setBundleToDelete] = useState<BundleConfig | null>(null);
  const [bundleToEdit, setBundleToEdit] = useState<{
    slug: string;
    sourceDirectory: string;
    entryBundleNodeName: string;
    entrySourceGraphSubdirectory?: string;
    entryFileType?: string;
    bundleNotes?: string;
    folderDerived?: boolean;
    defaultOutlinksDepth?: number;
    defaultInlinksDepth?: number;
  } | null>(null);
  
  // Find in bundles filter state (from CLI args or "Find in Bundles" button)
  const [findInBundlesOptions, setFindInBundlesOptions] = useState<FindInBundlesOptions | null>(null);
  const [isFindInBundlesFilterActive, setIsFindInBundlesFilterActive] = useState(false);
  const [bundlesThatTrackPage, setBundlesThatTrackPage] = useState<Set<string>>(new Set());
  const [loadingPageTracking, setLoadingPageTracking] = useState(false);
  
  // Track inline notes editing
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  // Close open menus on click outside, escape, or scrolling.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bundleListMenuRef.current && !bundleListMenuRef.current.contains(e.target as Node)) {
        setIsBundleListMenuOpen(false);
      }
      const target = e.target as Element;
      const clickedBundleActionTrigger = target.closest('[data-bundle-action-menu-trigger]');
      if (
        bundleActionMenuRef.current &&
        !bundleActionMenuRef.current.contains(target) &&
        !clickedBundleActionTrigger
      ) {
        setBundleActionMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBundleListMenuOpen(false);
        setBundleActionMenu(null);
      }
    };
    const handleScroll = () => setBundleActionMenu(null);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sortState, setSortState] = useState<SortState>({ key: 'default', direction: 'desc' });

  // Restore sort state for this session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BUNDLE_LIST_SORT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SortState> | null;
      if (!parsed || typeof parsed !== 'object') return;

      const key = parsed.key;
      const direction = parsed.direction;
      const validKeys: BundleListSortKey[] = [
        'default',
        'slug',
        'bundleCreatedAt',
        'bundleUpdatedAt',
        'mostRecentPublicationAt',
        'archivedAt'
      ];
      if (!key || !validKeys.includes(key as BundleListSortKey)) return;
      if (direction !== 'asc' && direction !== 'desc') return;

      setSortState({ key: key as BundleListSortKey, direction });
    } catch {
      // Ignore invalid session storage data
    }
  }, []);

  // Persist sort state for this session
  useEffect(() => {
    try {
      sessionStorage.setItem(BUNDLE_LIST_SORT_STORAGE_KEY, JSON.stringify(sortState));
    } catch {
      // Ignore storage failures (e.g. storage disabled)
    }
  }, [sortState]);

  const handleSortChange = (value: string) => {
    const [key, direction] = value.split(':') as [BundleListSortKey, SortDirection];
    setSortState({ key, direction });
  };

  const loadBundles = async () => {
    try {
      const data = await fetchBundles();
      setBundles(data);
    } catch (err) {
      // Ignore network errors from page navigation (fetch aborted mid-flight)
      if (err instanceof TypeError && err.message === 'Failed to fetch') return;
      logger.error('Failed to load bundles:', err);
      setError('Failed to load bundles');
    } finally {
      setLoading(false);
    }
  };

  const loadDirectories = async () => {
    try {
      const data = await fetchDirectories();
      setDirectories(data);
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') return;
      logger.error('Failed to load directories:', err);
    }
  };

  // Load find in bundles options from navigation state (Find in Bundles button) or CLI arguments
  const loadFindInBundlesOptions = async () => {
    logger.debug('[BundleList] loadFindInBundlesOptions called');
    logger.debug('[BundleList] location.state:', location.state);
    
    try {
      // First priority: Check if there are find in bundles options from navigation state (from "Find in Bundles" button)
      const navigationState = location.state as { findInBundlesOptions?: FindInBundlesOptions } | null;
      if (navigationState?.findInBundlesOptions) {
        logger.debug('[BundleList] Found find in bundles options from navigation state');
        logger.debug('[BundleList] Find in bundles options from navigation:', navigationState.findInBundlesOptions);
        setFindInBundlesOptions(navigationState.findInBundlesOptions);
        setIsFindInBundlesFilterActive(true);
        logger.debug('[BundleList] Find in bundles options from navigation loaded and set');
        return;
      }
      logger.debug('[BundleList] No find in bundles options in navigation state');
      
      // If no navigation state, check CLI arguments (this is the only place that translates CLI args to FindInBundlesOptions)
      logger.debug('[BundleList] Attempting to load find in bundles options from CLI args...');
      const cliTargetPageInfo = await window.electronAPI?.getTargetPageInfo();
      logger.debug('[BundleList] Find in bundles options received from CLI:', cliTargetPageInfo);
      if (cliTargetPageInfo) {
        setFindInBundlesOptions({
          vaultPath: cliTargetPageInfo.vaultPath,
          folderPath: cliTargetPageInfo.folderPath,
          pageName: cliTargetPageInfo.pageName
        });
        setIsFindInBundlesFilterActive(true);
        logger.debug('[BundleList] Find in bundles options from CLI loaded and set:', cliTargetPageInfo);
      } else {
        logger.debug('[BundleList] No find in bundles options available from navigation state or CLI args');
      }
    } catch (err) {
      logger.error('[BundleList] Failed to load find in bundles options:', err);
    }
  };

  // Check which bundles track the page from find in bundles options
  const checkBundlesForPageTracking = useCallback(async (signal?: AbortSignal) => {
    logger.debug('[BundleList] checkBundlesForPageTracking called');
    logger.debug('[BundleList] Current findInBundlesOptions:', findInBundlesOptions);
    logger.debug('[BundleList] Number of bundles:', bundles.length);

    if (!findInBundlesOptions) {
      logger.debug('[BundleList] No find in bundles options available for checking page tracking');
      return;
    }

    logger.debug(`[BundleList] Checking which bundles track page: "${findInBundlesOptions.pageName}"`);
    logger.debug(`[BundleList] Available bundles:`, bundles.map(s => s.slug));

    setLoadingPageTracking(true);
    const trackingBundles = new Set<string>();

    const pageName = findInBundlesOptions.pageName || '';
    for (const bundle of bundles) {
      if (signal?.aborted) return;
      logger.debug(`[BundleList] Checking bundle: ${bundle.slug}`);
      const tracks = await doesBundleTrackPage(bundle.slug, pageName, signal);
      logger.debug(`[BundleList] Bundle ${bundle.slug} tracks "${pageName}": ${tracks}`);
      if (tracks) {
        trackingBundles.add(bundle.slug);
      }
    }

    if (signal?.aborted) return;
    logger.debug(`[BundleList] Found ${trackingBundles.size} bundles that track the page:`, Array.from(trackingBundles));
    setBundlesThatTrackPage(trackingBundles);
    setLoadingPageTracking(false);
  }, [findInBundlesOptions, bundles]);

  // Check if a bundle tracks the target page
  const doesBundleTrackPage = async (bundleSlug: string, pageName: string, signal?: AbortSignal): Promise<boolean> => {
    try {
      const url = `bundles/${bundleSlug}/tracks-page?pageName=${encodeURIComponent(pageName)}`;
      logger.debug(`Making request to: ${url}`);
      const response = await apiRequest(url, { signal });
      logger.debug(`Response status: ${response.status} ${response.statusText}`);
      if (response.ok) {
        const data = await response.json();
        logger.debug(`Response data:`, data);
        return data.tracks;
      } else {
        logger.error(`Request failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      // Swallow expected fetch teardowns: an AbortController abort, or the
      // browser killing in-flight requests on hard navigation (which produces
      // a generic TypeError: "Failed to fetch" / "Network request failed" /
      // "Load failed" depending on the engine). doesBundleTrackPage is a
      // best-effort UI lookup that already returns false on failure, so these
      // navigation-time aborts shouldn't surface as ERROR-level log noise.
      const isFetchTeardown =
        signal?.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof TypeError &&
          /failed to fetch|network request failed|load failed/i.test(err.message ?? ''));
      if (isFetchTeardown) return false;
      logger.error('Failed to check if bundle tracks page:', err);
    }
    return false;
  };

  // Load bundles and directories on mount
  useEffect(() => {
    logger.debug('[BundleList] Initial useEffect running - loading bundles and directories');
    loadBundles();
    loadDirectories();
  }, []);

  // Load find in bundles options when location changes (handles navigation from "Find in Bundles")
  useEffect(() => {
    logger.debug('[BundleList] Location changed, loading find in bundles options');
    loadFindInBundlesOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Check which bundles track the page from find in bundles options
  useEffect(() => {
    logger.debug('[BundleList] findInBundlesOptions/bundles useEffect triggered');
    logger.debug('[BundleList] findInBundlesOptions:', findInBundlesOptions);
    logger.debug('[BundleList] bundles.length:', bundles.length);

    if (findInBundlesOptions && bundles.length > 0) {
      logger.debug('[BundleList] Conditions met, calling checkBundlesForPageTracking');
      const controller = new AbortController();
      void checkBundlesForPageTracking(controller.signal);
      return () => controller.abort();
    } else {
      logger.debug('[BundleList] Conditions not met for checkBundlesForPageTracking');
      if (!findInBundlesOptions) logger.debug('  - Missing findInBundlesOptions');
      if (bundles.length === 0) logger.debug('  - No bundles loaded yet');
    }
  }, [findInBundlesOptions, bundles, checkBundlesForPageTracking]);

  const handleEdit = (bundle: BundleConfig) => {
    setBundleToEdit({
      slug: bundle.slug,
      sourceDirectory: bundle.sourceDirectory || '',
      entryBundleNodeName: bundle.entryBundleNodeName || '',
      entrySourceGraphSubdirectory: bundle.entrySourceGraphSubdirectory || '',
      entryFileType: bundle.entryFileType || 'md',
      bundleNotes: bundle.bundleNotes || '',
      folderDerived: bundle.folderDerived === true,
      defaultOutlinksDepth: bundle.defaultOutlinksDepth,
      defaultInlinksDepth: bundle.defaultInlinksDepth,
    });
    setIsEditModalOpen(true);
  };

  const handleArchive = async (slug: string) => {
    try {
      await apiRequest(`bundles/${slug}/archive`, { method: 'POST' });
      loadBundles();
    } catch (err) {
      logger.error('Failed to archive bundle:', err);
    }
  };

  const handleUnarchive = async (slug: string) => {
    try {
      await apiRequest(`bundles/${slug}/unarchive`, { method: 'POST' });
      loadBundles();
    } catch (err) {
      logger.error('Failed to unarchive bundle:', err);
    }
  };

  const handleOpenBundle = (slug: string) => {
    const bundle = bundles.find(candidate => candidate.slug === slug);
    if (bundle?.repairRequired) {
      setBundleToRepair(bundle);
      return;
    }
    // Store find in bundles page name in sessionStorage for auto-selection
    if (findInBundlesOptions && isFindInBundlesFilterActive) {
      sessionStorage.setItem('autoSelectPageName', findInBundlesOptions.pageName);
    } else {
      sessionStorage.removeItem('autoSelectPageName');
    }

    // Navigate to the bundle's working graph or main view
    window.location.href = `/bundle/${slug}`;
  };

  const handleOpenWebsite = async (slug: string) => {
    const provider = await getActiveFrontendProvider();
    if (!provider?.fetchPublishedUrl) return;
    try {
      const url = await provider.fetchPublishedUrl(slug);
      await openExternal(url, 'bundleList');
    } catch (err) {
      logger.error('Failed to get website URL:', err);
      alert(`Failed to get website URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const startEditingNotes = (slug: string, currentNotes: string) => {
    setEditingNotes(slug);
    setTempNotes(currentNotes || '');
  };

  const cancelEditingNotes = () => {
    setEditingNotes(null);
    setTempNotes('');
  };

  const saveNotes = async (slug: string) => {
    try {
      const response = await apiRequest(`bundles/${slug}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleNotes: tempNotes })
      });

      if (response.ok) {
        // Update the local state
        setBundles(prev => prev.map(bundle => 
          bundle.slug === slug 
            ? { ...bundle, bundleNotes: tempNotes, bundleUpdatedAt: new Date().toISOString() }
            : bundle
        ));
        setEditingNotes(null);
        setTempNotes('');
      } else {
        const errorData = await response.json();
        alert(`Failed to update notes: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to update notes:', err);
      alert('Failed to update notes');
    }
  };

  const openDeleteModal = (bundle: BundleConfig) => {
    setBundleToDelete(bundle);
    setIsDeleteModalOpen(true);
  };

  const toggleBundleActionMenu = (event: React.MouseEvent<HTMLButtonElement>, slug: string) => {
    event.stopPropagation();
    if (bundleActionMenu?.slug === slug) {
      setBundleActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setBundleActionMenu({
      slug,
      top: Math.min(rect.bottom + 6, window.innerHeight - 236),
      right: Math.max(16, window.innerWidth - rect.right)
    });
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setBundleToDelete(null);
  };

  const openCliInstallModal = () => {
    setCliInstallResult(null);
    setIsCliInstallModalOpen(true);
    setIsBundleListMenuOpen(false);
  };

  const handleInstallCli = async () => {
    setIsInstallingCli(true);
    setCliInstallResult(null);
    try {
      if (typeof window.electronAPI?.installCommandLineInterface !== 'function') {
        setCliInstallResult({
          status: 'unavailable',
          commandPath: null,
          message: 'Install the command-line interface from the Meadow desktop application.',
        });
        return;
      }
      setCliInstallResult(await window.electronAPI.installCommandLineInterface());
    } catch (installError) {
      setCliInstallResult({
        status: 'unavailable',
        commandPath: null,
        message: installError instanceof Error ? installError.message : 'Installation failed.',
      });
    } finally {
      setIsInstallingCli(false);
    }
  };

  const handleBundleCreated = (slug: string) => {
    loadBundles();
    setIsCreateModalOpen(false);
    window.location.href = `/bundle/${slug}`;
  };

  const handleAddExampleBundle = async () => {
    try {
      const response = await apiRequest(`bundles/add-example`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        window.location.href = `/bundle/${data.slug}`;
      }
    } catch (error) {
      logger.error('Failed to add example bundle:', error);
    }
  };

  const currentBundles = bundles.filter(bundle => !bundle.archivedAt);
  const archivedBundles = bundles.filter(bundle => bundle.archivedAt);

  // Apply find in bundles filter if active
  let filteredCurrentBundles = isFindInBundlesFilterActive && findInBundlesOptions
    ? currentBundles.filter(bundle => bundlesThatTrackPage.has(bundle.slug))
    : currentBundles;
  let filteredArchivedBundles = isFindInBundlesFilterActive && findInBundlesOptions
    ? archivedBundles.filter(bundle => bundlesThatTrackPage.has(bundle.slug))
    : archivedBundles;

  // Apply search filter
  const searchFilteredCurrentBundles = filteredCurrentBundles.filter(bundle => bundleMatchesSearch(bundle, searchQuery));
  const searchFilteredArchivedBundles = filteredArchivedBundles.filter(bundle => bundleMatchesSearch(bundle, searchQuery));

  // Update filtered bundles to include search
  filteredCurrentBundles = searchFilteredCurrentBundles;
  filteredArchivedBundles = searchFilteredArchivedBundles;
    
  const displayBundlesRaw = activeTab === 'current' ? filteredCurrentBundles : filteredArchivedBundles;

  const displayBundles = useMemo(() => {
    const bundlesToSort = [...displayBundlesRaw];

    bundlesToSort.sort((a, b) => {
      // Preserve existing behavior: exact page matches (Find in Bundles) are pinned to the top.
      if (isFindInBundlesFilterActive && findInBundlesOptions) {
        const aExactMatch = a.entryBundleNodeName === findInBundlesOptions.pageName;
        const bExactMatch = b.entryBundleNodeName === findInBundlesOptions.pageName;
        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;
      }

      if (sortState.key === 'default') {
        return defaultBackendComparator(a, b);
      }

      const primary = compareByKey(a, b, sortState.key, sortState.direction);
      if (primary !== 0) return primary;

      // Stable, deterministic fallback
      return defaultBackendComparator(a, b);
    });

    return bundlesToSort;
  }, [
    displayBundlesRaw,
    isFindInBundlesFilterActive,
    findInBundlesOptions,
    sortState.key,
    sortState.direction
  ]);

  const actionMenuBundle = bundleActionMenu
    ? bundles.find(bundle => bundle.slug === bundleActionMenu.slug) || null
    : null;

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading bundles...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-500">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white px-8 py-7">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-8 mb-7 flex-shrink-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Bundles</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create, revisit, and publish bundles from your notes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-main-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-main-700 transition-colors"
            >
              {findInBundlesOptions && isFindInBundlesFilterActive ? 'Create Bundle for Page' : 'Create New Bundle'}
            </button>
            <div className="relative" ref={bundleListMenuRef}>
              <button
                onClick={() => setIsBundleListMenuOpen(!isBundleListMenuOpen)}
                className={`p-2 border rounded-lg transition-colors ${
                  isBundleListMenuOpen
                    ? 'bg-main-50 border-main-300 text-main-700'
                    : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
                title="More options"
                aria-label="More bundle options"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              {isBundleListMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsExampleBundleModalOpen(true);
                        setIsBundleListMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      Add Example Bundle
                    </button>
                    <button
                      onClick={openCliInstallModal}
                      className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      Install the command line interface
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {findInBundlesOptions && !isFindInBundlesFilterActive && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-main-200 bg-main-50 px-4 py-3">
            <span className="text-sm text-main-900">
              Show only bundles that contain &quot;{findInBundlesOptions.pageName}&quot;?
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFindInBundlesFilterActive(true)}
                className="px-3 py-1.5 bg-main-600 hover:bg-main-700 text-white rounded-md text-sm font-medium transition-colors"
                title="Apply find in bundles filter"
              >
                Apply filter
              </button>
              <button
                onClick={() => {
                  setFindInBundlesOptions(null);
                  setIsFindInBundlesFilterActive(false);
                }}
                className="px-2 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
                title="Clear find in bundles filter"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {findInBundlesOptions && isFindInBundlesFilterActive && (
          <div className="mb-4 flex items-center gap-2 self-start rounded-full border border-main-200 bg-main-50 py-1.5 pl-3 pr-1.5 text-main-800">
            <span className="text-sm">Find in bundles filter: &quot;{findInBundlesOptions.pageName}&quot;</span>
            <button
              onClick={() => setIsFindInBundlesFilterActive(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-main-600 hover:bg-main-100 hover:text-main-900"
              title="Remove filter"
              aria-label="Remove find in bundles filter"
            >
              ×
            </button>
          </div>
        )}

        {/* Tabs and list controls */}
        <div className="flex items-end justify-between gap-6 border-b border-neutral-200 flex-shrink-0">
          <nav className="flex gap-6" aria-label="Bundle lists">
            <button
              onClick={() => {
                setActiveTab('current');
                if (sortState.key === 'archivedAt') {
                  setSortState({ key: 'default', direction: 'desc' });
                }
              }}
              className={`pb-3 border-b-2 font-medium text-sm relative transition-colors ${
                activeTab === 'current'
                  ? 'border-main-500 text-neutral-950'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Current Bundles
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'current' ? 'bg-main-50 text-main-700' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {isFindInBundlesFilterActive && findInBundlesOptions ? filteredCurrentBundles.length : currentBundles.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`pb-3 border-b-2 font-medium text-sm relative transition-colors ${
                activeTab === 'archived'
                  ? 'border-main-500 text-neutral-950'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Archived Bundles
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'archived' ? 'bg-main-50 text-main-700' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {isFindInBundlesFilterActive && findInBundlesOptions ? filteredArchivedBundles.length : archivedBundles.length}
              </span>
            </button>
          </nav>

          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bundles..."
                className="w-56 rounded-lg border border-neutral-300 bg-neutral-50 py-1.5 pl-9 pr-8 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-main-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-main-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <select
              value={`${sortState.key}:${sortState.direction}`}
              onChange={(e) => handleSortChange(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white py-1.5 pl-3 pr-8 text-sm text-neutral-600 focus:border-main-500 focus:outline-none focus:ring-2 focus:ring-main-100"
              aria-label="Sort bundles"
            >
              <option value="default:desc">Recent activity</option>
              <option value="slug:asc">Bundle name</option>
              <option value="mostRecentPublicationAt:desc">Recently published</option>
              <option value="bundleUpdatedAt:desc">Recently updated</option>
              <option value="bundleCreatedAt:desc">Recently created</option>
              {activeTab === 'archived' && (
                <option value="archivedAt:desc">Recently archived</option>
              )}
            </select>
          </div>
        </div>

        {/* Bundles list */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
          {isFindInBundlesFilterActive && findInBundlesOptions && loadingPageTracking && (
            <div className="px-5 py-3 bg-main-50 border-b border-main-200">
              <div className="flex items-center space-x-2">
                <div className="animate-spin h-4 w-4 border border-main-300 border-t-main-600 rounded-full"></div>
                <span className="text-sm text-main-700">
                  Checking which bundles track &quot;{findInBundlesOptions.pageName}&quot;...
                </span>
              </div>
            </div>
          )}
          
          {isFindInBundlesFilterActive && findInBundlesOptions && !loadingPageTracking && displayBundles.length === 0 && (
            <div className="px-5 py-4 bg-warning-50 border-b border-warning-200">
              <div className="text-sm text-warning-800">
                No bundles found that track the page &quot;{findInBundlesOptions.pageName}&quot;. 
                <button 
                  onClick={() => setIsFindInBundlesFilterActive(false)}
                  className="ml-2 text-warning-600 underline hover:text-warning-800"
                >
                  Remove filter
                </button>
              </div>
            </div>
          )}
          
          {displayBundles.length > 0 && (
            <table className="min-w-full table-fixed">
              <thead className="sr-only">
                <tr>
                  <th>Bundle</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {displayBundles.map((bundle) => {
                  const isExactMatch = isFindInBundlesFilterActive && findInBundlesOptions && bundle.entryBundleNodeName === findInBundlesOptions.pageName;
                  const publishedDate = formatBundleDate(bundle.mostRecentPublicationAt);
                  const updatedDate = formatBundleDate(bundle.bundleUpdatedAt);
                  const createdDate = formatBundleDate(bundle.bundleCreatedAt);
                  const archivedDate = formatBundleDate(bundle.archivedAt);
                  const status = bundle.error || bundle.repairRequired
                    ? { label: 'Needs attention', classes: 'bg-danger-50 text-danger-700 ring-danger-200' }
                    : bundle.archivedAt
                      ? { label: 'Archived', classes: 'bg-neutral-100 text-neutral-600 ring-neutral-200' }
                      : bundle.hasRemotePublications
                        ? { label: 'Published', classes: 'bg-main-50 text-main-700 ring-main-200' }
                        : { label: 'Draft', classes: 'bg-neutral-100 text-neutral-600 ring-neutral-200' };
                  const activityText = bundle.repairRequired
                    ? `Missing selected folder: ${bundle.missingSelectedFolders?.[0]?.sourceGraphSubdirectory || '(source root)'}`
                    : bundle.error
                    ? 'Bundle details are unavailable'
                    : archivedDate
                      ? `Archived ${archivedDate}`
                      : publishedDate
                        ? `Published ${publishedDate}`
                        : updatedDate
                          ? `Updated ${updatedDate}`
                          : createdDate
                            ? `Created ${createdDate}`
                            : 'Not published yet';

                  return (
                    <tr
                      key={bundle.slug}
                      className={`group cursor-pointer transition-colors hover:bg-neutral-50 ${
                        isExactMatch ? 'bg-main-50/70 shadow-[inset_3px_0_0_#14b8a6]' : ''
                      }`}
                      onClick={() => handleOpenBundle(bundle.slug)}
                    >
                      <td className="w-[54%] px-5 py-4 align-middle">
                        <div className="min-w-0 pr-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenBundle(bundle.slug);
                            }}
                            className="block max-w-full truncate text-left text-[15px] font-semibold text-neutral-900 hover:text-main-700"
                            title={bundle.slug}
                          >
                            {highlightMatch(bundle.slug, searchQuery)}
                          </button>
                          {editingNotes === bundle.slug ? (
                            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <textarea
                                value={tempNotes}
                                onChange={(e) => setTempNotes(e.target.value)}
                                rows={3}
                                className="w-full max-w-xl rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-main-500 focus:outline-none focus:ring-2 focus:ring-main-100"
                                placeholder="Add a note about this bundle..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveNotes(bundle.slug);
                                  }}
                                  className="rounded-md bg-main-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-main-700"
                                >
                                  Save note
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditingNotes();
                                  }}
                                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : bundle.bundleNotes ? (
                            <p className="mt-1 truncate text-sm text-neutral-500" title={bundle.bundleNotes}>
                              {highlightMatch(bundle.bundleNotes.replace(/\s+/g, ' '), searchQuery)}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="w-[22%] px-4 py-4 align-middle">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.classes}`}>
                            {status.label}
                          </span>
                          <span className="text-xs text-neutral-500">{activityText}</span>
                        </div>
                      </td>
                      <td className="w-[24%] px-5 py-4 align-middle">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {bundle.hasRemotePublications && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenWebsite(bundle.slug);
                              }}
                              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-white hover:text-main-700 hover:shadow-sm"
                              title="Open published website"
                            >
                              View live
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenBundle(bundle.slug);
                            }}
                            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:border-neutral-400 hover:bg-neutral-50"
                          >
                            {bundle.repairRequired ? 'Repair' : 'Open'}
                          </button>
                          <button
                            onClick={(e) => toggleBundleActionMenu(e, bundle.slug)}
                            data-bundle-action-menu-trigger
                            className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                              bundleActionMenu?.slug === bundle.slug
                                ? 'border-main-300 bg-main-50 text-main-700'
                                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:bg-white hover:text-neutral-800'
                            }`}
                            title="More actions"
                            aria-label={`More actions for ${bundle.slug}`}
                          >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="5" cy="12" r="1.7" />
                              <circle cx="12" cy="12" r="1.7" />
                              <circle cx="19" cy="12" r="1.7" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          
          {displayBundles.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
                  <path d="M8 8h8M8 12h5" />
                </svg>
              </div>
              {bundles.length === 0 ? (
                <>
                  <p className="font-medium text-neutral-800">Turn your notes into bundles</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Create a bundle from your notes, or explore the example.
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="rounded-md bg-main-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-main-700"
                    >
                      create a bundle
                    </button>
                    <button
                      onClick={() => setIsExampleBundleModalOpen(true)}
                      className="text-sm font-medium text-main-700 hover:text-main-900"
                    >
                      add the example bundle
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-medium text-neutral-800">No {activeTab} bundles found</p>
                  <p className="mt-1 text-sm text-neutral-500">Try changing your search or filters.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {bundleActionMenu && actionMenuBundle && (
        <div
          ref={bundleActionMenuRef}
          className="fixed z-[70] w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-xl"
          style={{ top: bundleActionMenu.top, right: bundleActionMenu.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {actionMenuBundle.repairRequired ? (
            <button
              onClick={() => { setBundleActionMenu(null); setBundleToRepair(actionMenuBundle); }}
              className="w-full px-3 py-2 text-left text-sm text-danger-700 hover:bg-danger-50"
            >
              Relink selected folder
            </button>
          ) : (
            <button
              onClick={() => { setBundleActionMenu(null); handleEdit(actionMenuBundle); }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Edit bundle"
            >
              Edit bundle
            </button>
          )}
          <button
            onClick={() => {
              setBundleActionMenu(null);
              startEditingNotes(actionMenuBundle.slug, actionMenuBundle.bundleNotes || '');
            }}
            className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            title="Edit notes"
          >
            {actionMenuBundle.bundleNotes ? 'Edit note' : 'Add note'}
          </button>
          {activeTab === 'current' && !actionMenuBundle.archivedAt ? (
            <button
              onClick={() => {
                setBundleActionMenu(null);
                handleArchive(actionMenuBundle.slug);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Archive bundle"
            >
              Archive bundle
            </button>
          ) : (
            <button
              onClick={() => {
                setBundleActionMenu(null);
                handleUnarchive(actionMenuBundle.slug);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Unarchive bundle"
            >
              Restore bundle
            </button>
          )}
          <div className="my-1 border-t border-neutral-100" />
          <button
            onClick={() => {
              setBundleActionMenu(null);
              openDeleteModal(actionMenuBundle);
            }}
            className="w-full px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
            title="Delete bundle"
          >
            Delete bundle
          </button>
        </div>
      )}

      {/* Create Bundle Modal */}
      <CreateOrEditBundleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        mode="create"
        onSuccess={handleBundleCreated}
        directories={directories}
        existingSlugs={bundles.map(s => s.slug)}
        findInBundlesOptions={findInBundlesOptions}
      />

      {/* Edit Bundle Modal */}
      <CreateOrEditBundleModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setBundleToEdit(null);
        }}
        mode="edit"
        editBundle={bundleToEdit}
        onSuccess={() => {
          loadBundles();
          setIsEditModalOpen(false);
          setBundleToEdit(null);
        }}
        directories={directories}
      />

      {/* Delete Confirmation Modal */}
      <DeleteBundleModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onDeleted={() => { loadBundles(); closeDeleteModal(); }}
        bundleSlug={bundleToDelete?.slug || ''}
        isPublished={bundleToDelete?.hasRemotePublications ?? false}
      />

      <SelectedFolderRepairModal
        isOpen={bundleToRepair !== null}
        bundleSlug={bundleToRepair?.slug ?? ''}
        sourceDirectory={bundleToRepair?.sourceDirectory ?? ''}
        missingFolders={bundleToRepair?.missingSelectedFolders ?? []}
        onClose={() => setBundleToRepair(null)}
        onSuccess={() => {
          setBundleToRepair(null);
          void loadBundles();
        }}
      />

      {/* Example Bundle Confirmation Modal */}
      <Modal
        isOpen={isExampleBundleModalOpen}
        onClose={() => setIsExampleBundleModalOpen(false)}
        title="Just so you know, the example bundle is complex!"
        className="w-1/2 max-w-lg h-auto"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            The graph of the source markdown pages is big and highly interconnected.
          </p>
          <p className="text-gray-700">
            The tooling simulates a scenario where you have <em>already done some of the configuration</em>, including:
          </p>
          <ul className="list-disc list-inside text-gray-700 ml-2">
            <li>You tracked some of the pages</li>
            <li>You enabled the spaced repetition plugin</li>
            <li>You enabled sources export</li>
          </ul>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setIsExampleBundleModalOpen(false)}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Hmm... sounds like a lot.  No thanks
            </button>
            <button
              onClick={() => {
                setIsExampleBundleModalOpen(false);
                handleAddExampleBundle();
              }}
              className="px-4 py-2 bg-main-600 text-white rounded hover:bg-main-700"
            >
              Let&apos;s try it!
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isCliInstallModalOpen}
        onClose={() => setIsCliInstallModalOpen(false)}
        title="Install the command line interface"
        className="w-full max-w-lg h-auto"
      >
        <div className="space-y-4">
          <p className="text-neutral-700">
            Meadow will install a command named <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">meadow</code> in a standard command directory on your shell PATH. Meadow prefers a user-writable directory; macOS may ask for administrator approval if only a system directory is available.
          </p>
          <p className="text-neutral-700">The command currently lists bundles as JSON:</p>
          <div className="space-y-2 rounded-lg bg-neutral-950 p-3 font-mono text-sm text-neutral-100">
            <div>meadow bundles list</div>
            <div>meadow bundles list --archived</div>
          </div>
          {cliInstallResult && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                cliInstallResult.status === 'installed' || cliInstallResult.status === 'already-installed'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
              role="status"
            >
              {cliInstallResult.message}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setIsCliInstallModalOpen(false)}
              className="rounded border border-neutral-300 px-4 py-2 text-neutral-700 hover:bg-neutral-50"
            >
              {cliInstallResult?.status === 'installed' || cliInstallResult?.status === 'already-installed' ? 'Done' : 'Not now'}
            </button>
            {cliInstallResult?.status !== 'installed' && cliInstallResult?.status !== 'already-installed' && (
              <button
                onClick={() => { void handleInstallCli(); }}
                disabled={isInstallingCli}
                className="rounded bg-main-600 px-4 py-2 text-white hover:bg-main-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isInstallingCli ? 'Installing...' : 'Install meadow'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BundleList; 
