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
import { API_BASE_URL } from '../utils/apiConfig';
import { getActiveFrontendProvider } from '../publishing/providerRegistry';
import { fetchSites, fetchDirectories, SiteConfigWithSlug } from '../utils/siteApi';
import { FindInSitesOptions } from '../../../shared_code/types/findInSitesOptions';
import Modal from './Modal';
import VersionsModal from './VersionsModal';
import CreateOrEditSiteModal from './CreateOrEditSiteModal';
import DeleteSiteModal from './DeleteSiteModal';
import { logger } from '../utils/logger';
import { openExternal } from '../utils/openExternal';

type SiteConfig = SiteConfigWithSlug;

type SiteListSortKey =
  | 'default'
  | 'slug'
  | 'initialSitePageTitle'
  | 'siteCreatedAt'
  | 'siteUpdatedAt'
  | 'siteLastPublishedAt'
  | 'archivedAt';

type SortDirection = 'asc' | 'desc';

type SortState = {
  key: SiteListSortKey;
  direction: SortDirection;
};

const SITE_LIST_SORT_STORAGE_KEY = 'siteList.sortState.v1';

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

// Check if a site matches the search query
const siteMatchesSearch = (site: SiteConfig, query: string): boolean => {
  if (!query.trim()) return true;

  const lowerQuery = query.toLowerCase();
  const slug = (site.slug || '').toLowerCase();
  const initialPage = (site.initialSitePageTitle || '').toLowerCase();
  const notes = (site.siteNotes || '').toLowerCase();

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

// Mirror backend default ordering: lastPublishedAt desc, then updatedAt desc, with errors last.
const defaultBackendComparator = (a: SiteConfig, b: SiteConfig) => {
  if (a.error && !b.error) return 1;
  if (!a.error && b.error) return -1;
  if (a.error && b.error) return 0;

  const aPublished = parseTime(a.siteLastPublishedAt);
  const bPublished = parseTime(b.siteLastPublishedAt);
  const publishedCmp = compareNullableNumbers(aPublished, bPublished, 'desc');
  if (publishedCmp !== 0) return publishedCmp;

  const aUpdated = parseTime(a.siteUpdatedAt);
  const bUpdated = parseTime(b.siteUpdatedAt);
  const updatedCmp = compareNullableNumbers(aUpdated, bUpdated, 'desc');
  if (updatedCmp !== 0) return updatedCmp;

  return 0;
};

const compareByKey = (a: SiteConfig, b: SiteConfig, key: SiteListSortKey, direction: SortDirection) => {
  switch (key) {
    case 'slug': {
      const cmp = compareStrings(a.slug || '', b.slug || '');
      return direction === 'asc' ? cmp : -cmp;
    }
    case 'initialSitePageTitle': {
      const cmp = compareStrings(a.initialSitePageTitle || '', b.initialSitePageTitle || '');
      return direction === 'asc' ? cmp : -cmp;
    }
    case 'siteCreatedAt': {
      return compareNullableNumbers(parseTime(a.siteCreatedAt), parseTime(b.siteCreatedAt), direction);
    }
    case 'siteUpdatedAt': {
      return compareNullableNumbers(parseTime(a.siteUpdatedAt), parseTime(b.siteUpdatedAt), direction);
    }
    case 'siteLastPublishedAt': {
      return compareNullableNumbers(parseTime(a.siteLastPublishedAt), parseTime(b.siteLastPublishedAt), direction);
    }
    case 'archivedAt': {
      return compareNullableNumbers(parseTime(a.archivedAt), parseTime(b.archivedAt), direction);
    }
    case 'default':
    default:
      return 0;
  }
};

const SiteList: React.FC = () => {
  const location = useLocation();
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'archived'>('current');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExampleSiteModalOpen, setIsExampleSiteModalOpen] = useState(false);
  const [isSiteListMenuOpen, setIsSiteListMenuOpen] = useState(false);
  const siteListMenuRef = useRef<HTMLDivElement>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<SiteConfig | null>(null);
  const [siteToEdit, setSiteToEdit] = useState<{
    slug: string;
    sourceDirectory: string;
    initialSitePageTitle: string;
    initialSitePageDirectory?: string;
    siteNotes?: string;
  } | null>(null);
  const [siteForVersions, setSiteForVersions] = useState<string | null>(null);
  
  // Find in sites filter state (from CLI args or "Find in Sites" button)
  const [findInSitesOptions, setFindInSitesOptions] = useState<FindInSitesOptions | null>(null);
  const [isFindInSitesFilterActive, setIsFindInSitesFilterActive] = useState(false);
  const [sitesThatTrackPage, setSitesThatTrackPage] = useState<Set<string>>(new Set());
  const [loadingPageTracking, setLoadingPageTracking] = useState(false);
  
  // Track inline notes editing
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');

  // Close site list menu on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (siteListMenuRef.current && !siteListMenuRef.current.contains(e.target as Node)) {
        setIsSiteListMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSiteListMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sortState, setSortState] = useState<SortState>({ key: 'default', direction: 'desc' });

  // Restore sort state for this session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SITE_LIST_SORT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SortState> | null;
      if (!parsed || typeof parsed !== 'object') return;

      const key = parsed.key;
      const direction = parsed.direction;
      const validKeys: SiteListSortKey[] = [
        'default',
        'slug',
        'initialSitePageTitle',
        'siteCreatedAt',
        'siteUpdatedAt',
        'siteLastPublishedAt',
        'archivedAt'
      ];
      if (!key || !validKeys.includes(key as SiteListSortKey)) return;
      if (direction !== 'asc' && direction !== 'desc') return;

      setSortState({ key: key as SiteListSortKey, direction });
    } catch {
      // Ignore invalid session storage data
    }
  }, []);

  // Persist sort state for this session
  useEffect(() => {
    try {
      sessionStorage.setItem(SITE_LIST_SORT_STORAGE_KEY, JSON.stringify(sortState));
    } catch {
      // Ignore storage failures (e.g. storage disabled)
    }
  }, [sortState]);

  const getDefaultDirectionForKey = (key: SiteListSortKey): SortDirection => {
    if (
      key === 'siteCreatedAt' ||
      key === 'siteUpdatedAt' ||
      key === 'siteLastPublishedAt' ||
      key === 'archivedAt'
    ) {
      return 'desc';
    }
    return 'asc';
  };

  const handleSortHeaderClick = (key: SiteListSortKey) => {
    setSortState(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: getDefaultDirectionForKey(key) };
    });
  };

  const renderSortIndicator = (key: SiteListSortKey) => {
    if (sortState.key !== key) return null;
    return (
      <span className="text-neutral-400 ml-1" aria-hidden="true">
        {sortState.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const loadSites = async () => {
    try {
      const data = await fetchSites();
      setSites(data);
    } catch (err) {
      // Ignore network errors from page navigation (fetch aborted mid-flight)
      if (err instanceof TypeError && err.message === 'Failed to fetch') return;
      logger.error('Failed to load sites:', err);
      setError('Failed to load sites');
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

  // Load find in sites options from navigation state (Find in Sites button) or CLI arguments
  const loadFindInSitesOptions = async () => {
    logger.debug('[SiteList] loadFindInSitesOptions called');
    logger.debug('[SiteList] location.state:', location.state);
    
    try {
      // First priority: Check if there are find in sites options from navigation state (from "Find in Sites" button)
      const navigationState = location.state as { findInSitesOptions?: FindInSitesOptions } | null;
      if (navigationState?.findInSitesOptions) {
        logger.debug('[SiteList] Found find in sites options from navigation state');
        logger.debug('[SiteList] Find in sites options from navigation:', navigationState.findInSitesOptions);
        setFindInSitesOptions(navigationState.findInSitesOptions);
        setIsFindInSitesFilterActive(true);
        logger.debug('[SiteList] Find in sites options from navigation loaded and set');
        return;
      }
      logger.debug('[SiteList] No find in sites options in navigation state');
      
      // If no navigation state, check CLI arguments (this is the only place that translates CLI args to FindInSitesOptions)
      logger.debug('[SiteList] Attempting to load find in sites options from CLI args...');
      const cliTargetPageInfo = await window.electronAPI?.getTargetPageInfo();
      logger.debug('[SiteList] Find in sites options received from CLI:', cliTargetPageInfo);
      if (cliTargetPageInfo) {
        setFindInSitesOptions({
          vaultPath: cliTargetPageInfo.vaultPath,
          folderPath: cliTargetPageInfo.folderPath,
          pageName: cliTargetPageInfo.pageName
        });
        setIsFindInSitesFilterActive(true);
        logger.debug('[SiteList] Find in sites options from CLI loaded and set:', cliTargetPageInfo);
      } else {
        logger.debug('[SiteList] No find in sites options available from navigation state or CLI args');
      }
    } catch (err) {
      logger.error('[SiteList] Failed to load find in sites options:', err);
    }
  };

  // Check which sites track the page from find in sites options
  const checkSitesForPageTracking = useCallback(async (signal?: AbortSignal) => {
    logger.debug('[SiteList] checkSitesForPageTracking called');
    logger.debug('[SiteList] Current findInSitesOptions:', findInSitesOptions);
    logger.debug('[SiteList] Number of sites:', sites.length);

    if (!findInSitesOptions) {
      logger.debug('[SiteList] No find in sites options available for checking page tracking');
      return;
    }

    logger.debug(`[SiteList] Checking which sites track page: "${findInSitesOptions.pageName}"`);
    logger.debug(`[SiteList] Available sites:`, sites.map(s => s.slug));

    setLoadingPageTracking(true);
    const trackingSites = new Set<string>();

    const pageName = findInSitesOptions.pageName || '';
    for (const site of sites) {
      if (signal?.aborted) return;
      logger.debug(`[SiteList] Checking site: ${site.slug}`);
      const tracks = await doesSiteTrackPage(site.slug, pageName, signal);
      logger.debug(`[SiteList] Site ${site.slug} tracks "${pageName}": ${tracks}`);
      if (tracks) {
        trackingSites.add(site.slug);
      }
    }

    if (signal?.aborted) return;
    logger.debug(`[SiteList] Found ${trackingSites.size} sites that track the page:`, Array.from(trackingSites));
    setSitesThatTrackPage(trackingSites);
    setLoadingPageTracking(false);
  }, [findInSitesOptions, sites]);

  // Check if a site tracks the target page
  const doesSiteTrackPage = async (siteSlug: string, pageName: string, signal?: AbortSignal): Promise<boolean> => {
    try {
      const url = `${API_BASE_URL}/site/${siteSlug}/tracks-page?pageName=${encodeURIComponent(pageName)}`;
      logger.debug(`Making request to: ${url}`);
      const response = await fetch(url, { signal });
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
      // "Load failed" depending on the engine). doesSiteTrackPage is a
      // best-effort UI lookup that already returns false on failure, so these
      // navigation-time aborts shouldn't surface as ERROR-level log noise.
      const isFetchTeardown =
        signal?.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof TypeError &&
          /failed to fetch|network request failed|load failed/i.test(err.message ?? ''));
      if (isFetchTeardown) return false;
      logger.error('Failed to check if site tracks page:', err);
    }
    return false;
  };

  // Load sites and directories on mount
  useEffect(() => {
    logger.debug('[SiteList] Initial useEffect running - loading sites and directories');
    loadSites();
    loadDirectories();
  }, []);

  // Load find in sites options when location changes (handles navigation from "Find in Sites")
  useEffect(() => {
    logger.debug('[SiteList] Location changed, loading find in sites options');
    loadFindInSitesOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Check which sites track the page from find in sites options
  useEffect(() => {
    logger.debug('[SiteList] findInSitesOptions/sites useEffect triggered');
    logger.debug('[SiteList] findInSitesOptions:', findInSitesOptions);
    logger.debug('[SiteList] sites.length:', sites.length);

    if (findInSitesOptions && sites.length > 0) {
      logger.debug('[SiteList] Conditions met, calling checkSitesForPageTracking');
      const controller = new AbortController();
      void checkSitesForPageTracking(controller.signal);
      return () => controller.abort();
    } else {
      logger.debug('[SiteList] Conditions not met for checkSitesForPageTracking');
      if (!findInSitesOptions) logger.debug('  - Missing findInSitesOptions');
      if (sites.length === 0) logger.debug('  - No sites loaded yet');
    }
  }, [findInSitesOptions, sites, checkSitesForPageTracking]);

  const handleEdit = (site: SiteConfig) => {
    setSiteToEdit({
      slug: site.slug,
      sourceDirectory: site.sourceDirectory || '',
      initialSitePageTitle: site.initialSitePageTitle || '',
      initialSitePageDirectory: site.initialSitePageDirectory || '',
      siteNotes: site.siteNotes || ''
    });
    setIsEditModalOpen(true);
  };

  const handleArchive = async (slug: string) => {
    try {
      await fetch(`${API_BASE_URL}/sites/${slug}/archive`, { method: 'POST' });
      loadSites();
    } catch (err) {
      logger.error('Failed to archive site:', err);
    }
  };

  const handleUnarchive = async (slug: string) => {
    try {
      await fetch(`${API_BASE_URL}/sites/${slug}/unarchive`, { method: 'POST' });
      loadSites();
    } catch (err) {
      logger.error('Failed to unarchive site:', err);
    }
  };

  const handleOpenSite = (slug: string) => {
    // Store find in sites page name in sessionStorage for auto-selection
    if (findInSitesOptions && isFindInSitesFilterActive) {
      sessionStorage.setItem('autoSelectPageName', findInSitesOptions.pageName);
    } else {
      sessionStorage.removeItem('autoSelectPageName');
    }

    // Navigate to the site's working graph or main view
    window.location.href = `/site/${slug}`;
  };

  const handleOpenWebsite = async (slug: string) => {
    const provider = await getActiveFrontendProvider();
    if (!provider?.fetchPublishedUrl) return;
    try {
      const url = await provider.fetchPublishedUrl(slug);
      await openExternal(url, 'siteList');
    } catch (err) {
      logger.error('Failed to get website URL:', err);
      alert(`Failed to get website URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenVersions = (slug: string) => {
    setSiteForVersions(slug);
    setIsVersionsModalOpen(true);
  };

  const handleCloseVersions = () => {
    setIsVersionsModalOpen(false);
    setSiteForVersions(null);
  };

  const handleVersionUpdate = () => {
    loadSites(); // Reload sites to get updated version info
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
      const response = await fetch(`${API_BASE_URL}/sites/${slug}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteNotes: tempNotes })
      });

      if (response.ok) {
        // Update the local state
        setSites(prev => prev.map(site => 
          site.slug === slug 
            ? { ...site, siteNotes: tempNotes, siteUpdatedAt: new Date().toISOString() }
            : site
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

  const openDeleteModal = (site: SiteConfig) => {
    setSiteToDelete(site);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSiteToDelete(null);
  };

  const handleSiteCreated = (slug: string) => {
    loadSites();
    setIsCreateModalOpen(false);
    window.location.href = `/site/${slug}`;
  };

  const handleAddExampleSite = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sites/add-example`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        window.location.href = `/site/${data.slug}`;
      }
    } catch (error) {
      logger.error('Failed to add example site:', error);
    }
  };

  const currentSites = sites.filter(site => !site.archivedAt);
  const archivedSites = sites.filter(site => site.archivedAt);

  // Apply find in sites filter if active
  let filteredCurrentSites = isFindInSitesFilterActive && findInSitesOptions
    ? currentSites.filter(site => sitesThatTrackPage.has(site.slug))
    : currentSites;
  let filteredArchivedSites = isFindInSitesFilterActive && findInSitesOptions
    ? archivedSites.filter(site => sitesThatTrackPage.has(site.slug))
    : archivedSites;

  // Apply search filter
  const searchFilteredCurrentSites = filteredCurrentSites.filter(site => siteMatchesSearch(site, searchQuery));
  const searchFilteredArchivedSites = filteredArchivedSites.filter(site => siteMatchesSearch(site, searchQuery));

  // Update filtered sites to include search
  filteredCurrentSites = searchFilteredCurrentSites;
  filteredArchivedSites = searchFilteredArchivedSites;
    
  const displaySitesRaw = activeTab === 'current' ? filteredCurrentSites : filteredArchivedSites;

  const displaySites = useMemo(() => {
    const sitesToSort = [...displaySitesRaw];

    sitesToSort.sort((a, b) => {
      // Preserve existing behavior: exact page matches (Find in Sites) are pinned to the top.
      if (isFindInSitesFilterActive && findInSitesOptions) {
        const aExactMatch = a.initialSitePageTitle === findInSitesOptions.pageName;
        const bExactMatch = b.initialSitePageTitle === findInSitesOptions.pageName;
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

    return sitesToSort;
  }, [
    displaySitesRaw,
    isFindInSitesFilterActive,
    findInSitesOptions,
    sortState.key,
    sortState.direction
  ]);

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading sites...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-500">{error}</div>;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 py-2 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold">Sites</h1>
            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sites..."
                className="pl-8 pr-8 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-main-500 focus:border-transparent w-48"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {findInSitesOptions && !isFindInSitesFilterActive && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsFindInSitesFilterActive(true)}
                  className="px-3 py-1 bg-main-100 hover:bg-main-200 text-main-800 rounded-md text-sm transition-colors"
                  title="Apply find in sites filter"
                >
                  Filter by &quot;{findInSitesOptions.pageName}&quot;
                </button>
                <button
                  onClick={() => {
                    setFindInSitesOptions(null);
                    setIsFindInSitesFilterActive(false);
                  }}
                  className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-md text-sm transition-colors"
                  title="Clear find in sites filter"
                >
                  Clear
                </button>
              </div>
            )}
            {findInSitesOptions && isFindInSitesFilterActive && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-main-100 text-main-800 rounded-md">
                <span className="text-sm">
                  Find in sites filter: &quot;{findInSitesOptions.pageName}&quot;
                </span>
                <button
                  onClick={() => setIsFindInSitesFilterActive(false)}
                  className="text-main-600 hover:text-main-800 font-bold"
                  title="Remove filter"
                >
                  ×
                </button>
                <button
                  onClick={() => {
                    setFindInSitesOptions(null);
                    setIsFindInSitesFilterActive(false);
                  }}
                  className="text-main-600 hover:text-main-800 text-sm font-medium"
                  title="Clear find in sites filter"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-success-600 text-white rounded hover:bg-success-700"
            >
              {findInSitesOptions && isFindInSitesFilterActive ? 'Create Site for Page' : 'Create New Site'}
            </button>
            <div className="relative" ref={siteListMenuRef}>
              <button
                onClick={() => setIsSiteListMenuOpen(!isSiteListMenuOpen)}
                className="px-2 py-1 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded"
                title="More options"
              >
                ⋯
              </button>
              {isSiteListMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsExampleSiteModalOpen(true);
                        setIsSiteListMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
                    >
                      Add Example Site
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex-shrink-0">
          <div className="border-b border-neutral-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('current')}
                className={`py-2 px-1 border-b-2 font-medium text-sm relative ${
                  activeTab === 'current'
                    ? 'border-main-500 text-main-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                Current Sites ({isFindInSitesFilterActive && findInSitesOptions ? filteredCurrentSites.length : currentSites.length})
                {/* Show badge when viewing archived and there are search matches in current */}
                {activeTab === 'archived' && searchQuery && filteredCurrentSites.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-main-600 rounded-full">
                    {filteredCurrentSites.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('archived')}
                className={`py-2 px-1 border-b-2 font-medium text-sm relative ${
                  activeTab === 'archived'
                    ? 'border-main-500 text-main-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                Archived Sites ({isFindInSitesFilterActive && findInSitesOptions ? filteredArchivedSites.length : archivedSites.length})
                {/* Show badge for find-in-sites filter when viewing current tab */}
                {isFindInSitesFilterActive && findInSitesOptions && activeTab === 'current' && filteredArchivedSites.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-main-600 rounded-full">
                    {filteredArchivedSites.length}
                  </span>
                )}
                {/* Show badge when viewing current and there are search matches in archived */}
                {activeTab === 'current' && searchQuery && !isFindInSitesFilterActive && filteredArchivedSites.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-main-600 rounded-full">
                    {filteredArchivedSites.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>

        {/* Sites Table */}
        <div className="flex-1 overflow-y-auto bg-white shadow rounded-lg">
          {isFindInSitesFilterActive && findInSitesOptions && loadingPageTracking && (
            <div className="px-6 py-4 bg-main-50 border-b border-main-200">
              <div className="flex items-center space-x-2">
                <div className="animate-spin h-4 w-4 border border-main-300 border-t-main-600 rounded-full"></div>
                <span className="text-sm text-main-700">
                  Checking which sites track &quot;{findInSitesOptions.pageName}&quot;...
                </span>
              </div>
            </div>
          )}
          
          {isFindInSitesFilterActive && findInSitesOptions && !loadingPageTracking && displaySites.length === 0 && (
            <div className="px-6 py-8 bg-warning-50 border-b border-warning-200">
              <div className="text-sm text-warning-800">
                No sites found that track the page &quot;{findInSitesOptions.pageName}&quot;. 
                <button 
                  onClick={() => setIsFindInSitesFilterActive(false)}
                  className="ml-2 text-warning-600 underline hover:text-warning-800"
                >
                  Remove filter
                </button>
              </div>
            </div>
          )}
          
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick('slug')}
                    className="inline-flex items-center hover:text-neutral-700"
                    title="Sort by site"
                  >
                    Site {renderSortIndicator('slug')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick('initialSitePageTitle')}
                    className="inline-flex items-center hover:text-neutral-700"
                    title="Sort by initial page"
                  >
                    Initial Page {renderSortIndicator('initialSitePageTitle')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick('siteCreatedAt')}
                    className="inline-flex items-center hover:text-neutral-700"
                    title="Sort by created date"
                  >
                    Created At {renderSortIndicator('siteCreatedAt')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick('siteUpdatedAt')}
                    className="inline-flex items-center hover:text-neutral-700"
                    title="Sort by updated date"
                  >
                    Updated At {renderSortIndicator('siteUpdatedAt')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick('siteLastPublishedAt')}
                    className="inline-flex items-center hover:text-neutral-700"
                    title="Sort by last published date"
                  >
                    Last Published {renderSortIndicator('siteLastPublishedAt')}
                  </button>
                </th>
                {activeTab === 'archived' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => handleSortHeaderClick('archivedAt')}
                      className="inline-flex items-center hover:text-neutral-700"
                      title="Sort by archived date"
                    >
                      Archived At {renderSortIndicator('archivedAt')}
                    </button>
                  </th>
                )}
                <th className="px-6 py-3">
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {displaySites.map((site) => {
                const isExactMatch = isFindInSitesFilterActive && findInSitesOptions && site.initialSitePageTitle === findInSitesOptions.pageName;
                return (
                <React.Fragment key={site.slug}>
                  <tr 
                    className={`hover:bg-neutral-50 cursor-pointer ${isExactMatch ? 'bg-main-50 border-l-4 border-l-main-500' : ''}`}
                    onClick={() => handleOpenSite(site.slug)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="min-w-0 flex-1 max-w-xs">
                          <div
                            className="text-sm font-medium text-neutral-900 truncate"
                            title={site.slug}
                          >
                            {highlightMatch(site.slug, searchQuery)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="text-sm text-neutral-900 truncate max-w-48"
                        title={site.initialSitePageTitle || 'N/A'}
                      >
                        {highlightMatch(site.initialSitePageTitle || 'N/A', searchQuery)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {site.siteCreatedAt ? new Date(site.siteCreatedAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {site.siteUpdatedAt ? new Date(site.siteUpdatedAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {site.siteLastPublishedAt ? new Date(site.siteLastPublishedAt).toLocaleDateString() : 'Never'}
                    </td>
                    {activeTab === 'archived' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                        {site.archivedAt ? new Date(site.archivedAt).toLocaleDateString() : 'N/A'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      <div className="flex space-x-2">
                        {site.siteLastPublishedAt && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenWebsite(site.slug);
                            }}
                            className="text-success-600 hover:text-success-900"
                            title="Open published website"
                          >
                            🌐
                          </button>
                        )}
                        {site.generatedSiteVersions && site.generatedSiteVersions.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenVersions(site.slug);
                            }}
                            className="text-main-600 hover:text-main-900"
                            title="Manage versions"
                          >
                            V
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(site);
                          }}
                          className="text-info-600 hover:text-info-900"
                          title="Edit site"
                        >
                          ✏️
                        </button>
                        {activeTab === 'current' && !site.archivedAt ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(site.slug);
                            }}
                            className="text-warning-600 hover:text-warning-900"
                            title="Archive site"
                          >
                            📦
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnarchive(site.slug);
                            }}
                            className="text-success-600 hover:text-success-900"
                            title="Unarchive site"
                          >
                            📤
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteModal(site);
                          }}
                          className="text-danger-600 hover:text-danger-900"
                          title="Delete site"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Notes row */}
                  <tr className="border-t-0">
                    <td 
                      colSpan={activeTab === 'archived' ? 7 : 6} 
                      className={`px-6 py-2 group ${isExactMatch ? 'bg-main-50 border-l-4 border-l-main-500' : 'bg-neutral-50'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start space-x-2">
                        <div className="flex-1">
                          {editingNotes === site.slug ? (
                            <div className="space-y-2">
                              <textarea
                                value={tempNotes}
                                onChange={(e) => setTempNotes(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-main-500 text-sm"
                                placeholder="Enter notes..."
                                autoFocus
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => saveNotes(site.slug)}
                                  className="px-3 py-1 bg-btn-standard-normal text-btn-standard-text text-xs rounded hover:bg-btn-standard-hover"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingNotes}
                                  className="px-3 py-1 bg-neutral-600 text-white text-xs rounded hover:bg-neutral-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-neutral-600 whitespace-pre-wrap min-h-[1.5rem]">
                              {site.siteNotes &&
                                site.siteNotes.split('\n').map((line, idx) => (
                                  <React.Fragment key={idx}>
                                    {highlightMatch(line, searchQuery)}
                                    {idx < site.siteNotes!.split('\n').length - 1 && <br />}
                                  </React.Fragment>
                                ))
                              }
                            </div>
                          )}
                        </div>
                        {editingNotes !== site.slug && (
                          <button
                            onClick={() => startEditingNotes(site.slug, site.siteNotes || '')}
                            className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-600 transition-opacity"
                            title="Edit notes"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
          
          {displaySites.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-neutral-500">No {activeTab} sites found.</p>
              {sites.length === 0 && (
                <div className="mt-8 p-4 bg-main-50 border border-main-200 rounded-lg inline-block">
                  <p className="text-lg font-medium text-neutral-800 mb-1">Turn your notes into sites</p>
                  <p className="text-sm text-neutral-600">
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="text-main-600 hover:text-main-700 underline"
                    >
                      create a site
                    </button>
                    {' or '}
                    <button
                      onClick={() => setIsExampleSiteModalOpen(true)}
                      className="text-main-600 hover:text-main-700 underline"
                    >
                      add the example site
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Site Modal */}
      <CreateOrEditSiteModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        mode="create"
        onSuccess={handleSiteCreated}
        directories={directories}
        existingSlugs={sites.map(s => s.slug)}
        findInSitesOptions={findInSitesOptions}
      />

      {/* Edit Site Modal */}
      <CreateOrEditSiteModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSiteToEdit(null);
        }}
        mode="edit"
        editSite={siteToEdit}
        onSuccess={() => {
          loadSites();
          setIsEditModalOpen(false);
          setSiteToEdit(null);
        }}
        directories={directories}
      />

      {/* Delete Confirmation Modal */}
      <DeleteSiteModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onDeleted={() => { loadSites(); closeDeleteModal(); }}
        siteSlug={siteToDelete?.slug || ''}
        isPublished={!!siteToDelete?.siteLastPublishedAt}
      />

      {/* Versions Modal */}
      <VersionsModal
        isOpen={isVersionsModalOpen}
        onClose={handleCloseVersions}
        siteSlug={siteForVersions || ''}
        onVersionUpdate={handleVersionUpdate}
      />

      {/* Example Site Confirmation Modal */}
      <Modal
        isOpen={isExampleSiteModalOpen}
        onClose={() => setIsExampleSiteModalOpen(false)}
        title="Just so you know, the example site is complex!"
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
            <li>You enabled markdown download</li>
          </ul>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setIsExampleSiteModalOpen(false)}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Hmm... sounds like a lot.  No thanks
            </button>
            <button
              onClick={() => {
                setIsExampleSiteModalOpen(false);
                handleAddExampleSite();
              }}
              className="px-4 py-2 bg-main-600 text-white rounded hover:bg-main-700"
            >
              Let&apos;s try it!
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SiteList; 