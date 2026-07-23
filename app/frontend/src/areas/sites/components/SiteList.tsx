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
import { API_BASE_URL } from '../../../shared/utils/apiConfig';
import { getActiveFrontendProvider } from '../../../shared/publishing-provider-host/providerRegistry';
import { fetchSites, fetchDirectories, SiteConfigWithSlug } from '../../../shared/utils/siteApi';
import { FindInSitesOptions } from '../../../../../shared_code/types/findInSitesOptions';
import Modal from '../../../shared/components/Modal';
import VersionsModal from '../../../shared/site-management/VersionsModal';
import CreateOrEditSiteModal from './CreateOrEditSiteModal';
import DeleteSiteModal from '../../../shared/site-management/DeleteSiteModal';
import { logger } from '../../../shared/utils/logger';
import { openExternal } from '../../../shared/utils/openExternal';

type SiteConfig = SiteConfigWithSlug;

type SiteListSortKey =
  | 'default'
  | 'slug'
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

const formatSiteDate = (value?: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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
  const siteActionMenuRef = useRef<HTMLDivElement>(null);
  const [siteActionMenu, setSiteActionMenu] = useState<{
    slug: string;
    top: number;
    right: number;
  } | null>(null);
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

  // Close open menus on click outside, escape, or scrolling.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (siteListMenuRef.current && !siteListMenuRef.current.contains(e.target as Node)) {
        setIsSiteListMenuOpen(false);
      }
      const target = e.target as Element;
      const clickedSiteActionTrigger = target.closest('[data-site-action-menu-trigger]');
      if (
        siteActionMenuRef.current &&
        !siteActionMenuRef.current.contains(target) &&
        !clickedSiteActionTrigger
      ) {
        setSiteActionMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSiteListMenuOpen(false);
        setSiteActionMenu(null);
      }
    };
    const handleScroll = () => setSiteActionMenu(null);
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
      const raw = sessionStorage.getItem(SITE_LIST_SORT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SortState> | null;
      if (!parsed || typeof parsed !== 'object') return;

      const key = parsed.key;
      const direction = parsed.direction;
      const validKeys: SiteListSortKey[] = [
        'default',
        'slug',
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

  const handleSortChange = (value: string) => {
    const [key, direction] = value.split(':') as [SiteListSortKey, SortDirection];
    setSortState({ key, direction });
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
      const url = `${API_BASE_URL}/sites/${siteSlug}/tracks-page?pageName=${encodeURIComponent(pageName)}`;
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

  const toggleSiteActionMenu = (event: React.MouseEvent<HTMLButtonElement>, slug: string) => {
    event.stopPropagation();
    if (siteActionMenu?.slug === slug) {
      setSiteActionMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setSiteActionMenu({
      slug,
      top: Math.min(rect.bottom + 6, window.innerHeight - 236),
      right: Math.max(16, window.innerWidth - rect.right)
    });
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

  const actionMenuSite = siteActionMenu
    ? sites.find(site => site.slug === siteActionMenu.slug) || null
    : null;

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading sites...</div>;
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
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">Sites</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create, revisit, and publish sites from your notes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-main-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-main-700 transition-colors"
            >
              {findInSitesOptions && isFindInSitesFilterActive ? 'Create Site for Page' : 'Create New Site'}
            </button>
            <div className="relative" ref={siteListMenuRef}>
              <button
                onClick={() => setIsSiteListMenuOpen(!isSiteListMenuOpen)}
                className={`p-2 border rounded-lg transition-colors ${
                  isSiteListMenuOpen
                    ? 'bg-main-50 border-main-300 text-main-700'
                    : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
                title="More options"
                aria-label="More site options"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              {isSiteListMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsExampleSiteModalOpen(true);
                        setIsSiteListMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      Add Example Site
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {findInSitesOptions && !isFindInSitesFilterActive && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-main-200 bg-main-50 px-4 py-3">
            <span className="text-sm text-main-900">
              Show only sites that contain &quot;{findInSitesOptions.pageName}&quot;?
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFindInSitesFilterActive(true)}
                className="px-3 py-1.5 bg-main-600 hover:bg-main-700 text-white rounded-md text-sm font-medium transition-colors"
                title="Apply find in sites filter"
              >
                Apply filter
              </button>
              <button
                onClick={() => {
                  setFindInSitesOptions(null);
                  setIsFindInSitesFilterActive(false);
                }}
                className="px-2 py-1.5 text-sm text-neutral-600 hover:text-neutral-900"
                title="Clear find in sites filter"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {findInSitesOptions && isFindInSitesFilterActive && (
          <div className="mb-4 flex items-center gap-2 self-start rounded-full border border-main-200 bg-main-50 py-1.5 pl-3 pr-1.5 text-main-800">
            <span className="text-sm">Find in sites filter: &quot;{findInSitesOptions.pageName}&quot;</span>
            <button
              onClick={() => setIsFindInSitesFilterActive(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-main-600 hover:bg-main-100 hover:text-main-900"
              title="Remove filter"
              aria-label="Remove find in sites filter"
            >
              ×
            </button>
          </div>
        )}

        {/* Tabs and list controls */}
        <div className="flex items-end justify-between gap-6 border-b border-neutral-200 flex-shrink-0">
          <nav className="flex gap-6" aria-label="Site lists">
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
              Current Sites
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'current' ? 'bg-main-50 text-main-700' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {isFindInSitesFilterActive && findInSitesOptions ? filteredCurrentSites.length : currentSites.length}
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
              Archived Sites
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'archived' ? 'bg-main-50 text-main-700' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {isFindInSitesFilterActive && findInSitesOptions ? filteredArchivedSites.length : archivedSites.length}
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
                placeholder="Search sites..."
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
              aria-label="Sort sites"
            >
              <option value="default:desc">Recent activity</option>
              <option value="slug:asc">Site name</option>
              <option value="siteLastPublishedAt:desc">Recently published</option>
              <option value="siteUpdatedAt:desc">Recently updated</option>
              <option value="siteCreatedAt:desc">Recently created</option>
              {activeTab === 'archived' && (
                <option value="archivedAt:desc">Recently archived</option>
              )}
            </select>
          </div>
        </div>

        {/* Sites list */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
          {isFindInSitesFilterActive && findInSitesOptions && loadingPageTracking && (
            <div className="px-5 py-3 bg-main-50 border-b border-main-200">
              <div className="flex items-center space-x-2">
                <div className="animate-spin h-4 w-4 border border-main-300 border-t-main-600 rounded-full"></div>
                <span className="text-sm text-main-700">
                  Checking which sites track &quot;{findInSitesOptions.pageName}&quot;...
                </span>
              </div>
            </div>
          )}
          
          {isFindInSitesFilterActive && findInSitesOptions && !loadingPageTracking && displaySites.length === 0 && (
            <div className="px-5 py-4 bg-warning-50 border-b border-warning-200">
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
          
          {displaySites.length > 0 && (
            <table className="min-w-full table-fixed">
              <thead className="sr-only">
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {displaySites.map((site) => {
                  const isExactMatch = isFindInSitesFilterActive && findInSitesOptions && site.initialSitePageTitle === findInSitesOptions.pageName;
                  const publishedDate = formatSiteDate(site.siteLastPublishedAt);
                  const updatedDate = formatSiteDate(site.siteUpdatedAt);
                  const createdDate = formatSiteDate(site.siteCreatedAt);
                  const archivedDate = formatSiteDate(site.archivedAt);
                  const status = site.error
                    ? { label: 'Needs attention', classes: 'bg-danger-50 text-danger-700 ring-danger-200' }
                    : site.archivedAt
                      ? { label: 'Archived', classes: 'bg-neutral-100 text-neutral-600 ring-neutral-200' }
                      : site.siteLastPublishedAt
                        ? { label: 'Published', classes: 'bg-main-50 text-main-700 ring-main-200' }
                        : { label: 'Draft', classes: 'bg-neutral-100 text-neutral-600 ring-neutral-200' };
                  const activityText = site.error
                    ? 'Site details are unavailable'
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
                      key={site.slug}
                      className={`group cursor-pointer transition-colors hover:bg-neutral-50 ${
                        isExactMatch ? 'bg-main-50/70 shadow-[inset_3px_0_0_#14b8a6]' : ''
                      }`}
                      onClick={() => handleOpenSite(site.slug)}
                    >
                      <td className="w-[54%] px-5 py-4 align-middle">
                        <div className="min-w-0 pr-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSite(site.slug);
                            }}
                            className="block max-w-full truncate text-left text-[15px] font-semibold text-neutral-900 hover:text-main-700"
                            title={site.slug}
                          >
                            {highlightMatch(site.slug, searchQuery)}
                          </button>
                          {editingNotes === site.slug ? (
                            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <textarea
                                value={tempNotes}
                                onChange={(e) => setTempNotes(e.target.value)}
                                rows={3}
                                className="w-full max-w-xl rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-main-500 focus:outline-none focus:ring-2 focus:ring-main-100"
                                placeholder="Add a note about this site..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveNotes(site.slug);
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
                          ) : site.siteNotes ? (
                            <p className="mt-1 truncate text-sm text-neutral-500" title={site.siteNotes}>
                              {highlightMatch(site.siteNotes.replace(/\s+/g, ' '), searchQuery)}
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
                          {site.siteLastPublishedAt && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenWebsite(site.slug);
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
                              handleOpenSite(site.slug);
                            }}
                            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:border-neutral-400 hover:bg-neutral-50"
                          >
                            Open
                          </button>
                          <button
                            onClick={(e) => toggleSiteActionMenu(e, site.slug)}
                            data-site-action-menu-trigger
                            className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                              siteActionMenu?.slug === site.slug
                                ? 'border-main-300 bg-main-50 text-main-700'
                                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:bg-white hover:text-neutral-800'
                            }`}
                            title="More actions"
                            aria-label={`More actions for ${site.slug}`}
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
          
          {displaySites.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
                  <path d="M8 8h8M8 12h5" />
                </svg>
              </div>
              {sites.length === 0 ? (
                <>
                  <p className="font-medium text-neutral-800">Turn your notes into sites</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Create a site from your notes, or explore the example.
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="rounded-md bg-main-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-main-700"
                    >
                      create a site
                    </button>
                    <button
                      onClick={() => setIsExampleSiteModalOpen(true)}
                      className="text-sm font-medium text-main-700 hover:text-main-900"
                    >
                      add the example site
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-medium text-neutral-800">No {activeTab} sites found</p>
                  <p className="mt-1 text-sm text-neutral-500">Try changing your search or filters.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {siteActionMenu && actionMenuSite && (
        <div
          ref={siteActionMenuRef}
          className="fixed z-[70] w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-xl"
          style={{ top: siteActionMenu.top, right: siteActionMenu.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {actionMenuSite.generatedSiteVersions && actionMenuSite.generatedSiteVersions.length > 1 && (
            <button
              onClick={() => {
                setSiteActionMenu(null);
                handleOpenVersions(actionMenuSite.slug);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Manage versions"
            >
              Manage versions
            </button>
          )}
          <button
            onClick={() => {
              setSiteActionMenu(null);
              handleEdit(actionMenuSite);
            }}
            className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            title="Edit site"
          >
            Edit site
          </button>
          <button
            onClick={() => {
              setSiteActionMenu(null);
              startEditingNotes(actionMenuSite.slug, actionMenuSite.siteNotes || '');
            }}
            className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            title="Edit notes"
          >
            {actionMenuSite.siteNotes ? 'Edit note' : 'Add note'}
          </button>
          {activeTab === 'current' && !actionMenuSite.archivedAt ? (
            <button
              onClick={() => {
                setSiteActionMenu(null);
                handleArchive(actionMenuSite.slug);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Archive site"
            >
              Archive site
            </button>
          ) : (
            <button
              onClick={() => {
                setSiteActionMenu(null);
                handleUnarchive(actionMenuSite.slug);
              }}
              className="w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              title="Unarchive site"
            >
              Restore site
            </button>
          )}
          <div className="my-1 border-t border-neutral-100" />
          <button
            onClick={() => {
              setSiteActionMenu(null);
              openDeleteModal(actionMenuSite);
            }}
            className="w-full px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
            title="Delete site"
          >
            Delete site
          </button>
        </div>
      )}

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
            <li>You enabled sources export</li>
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
