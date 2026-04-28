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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import HtmlGenerationProgress from './HtmlGenerationProgress';
import { SaveLocallyTab } from './SaveLocallyTab';
import { AdvancedTab } from './AdvancedTab';
import { useActivePublishingProvider } from '../publishing/useActivePublishingProvider';
import CustomizeSidebar from './CustomizeSidebar';
import { UntrackedPagesButton } from './UntrackedPagesButton';
import PreviewChangesTab from './PreviewChangesTab';
import { ConfigFileExplorerApi } from '../../../shared_components/ConfigFileExplorer';
import { encodePathForUrl } from '../../../shared_code/utils/urlUtils';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';
import { openExternal } from '../utils/openExternal';
import { DisabledTooltip } from './DisabledTooltip';

type OverrideSetting = 'inherit' | 'enabled' | 'disabled';
type TopLevelTab = 'review' | 'share';
type PreviewSubTab = 'sitePreview' | 'changes';
type ShareSubTab = 'localExport' | 'publish' | 'advanced';
type PreviewModalTab = PreviewSubTab | ShareSubTab | 'customization';  // customization kept for URL param backward compat

interface PreviewPublishModalProps {
  onClose: () => void;
  slug: string;

  // Optional initial context (for "Preview from page")
  startPage?: { title: string; sourceGraphSubdirectory?: string };

  // Publish options (parent manages these across app)
  globalGenerationOptions: {
    breadcrumbsEnabled: boolean;
    backlinksEnabled: boolean;
    tagsEnabled: boolean;
    hoverPreviewEnabled: boolean;
    markdownZipEnabled: boolean;
    spacedRepetitionEnabled: boolean;
  };
  siteGenerationOptions: {
    breadcrumbsSetting: OverrideSetting;
    backlinksSetting: OverrideSetting;
    tagsSetting: OverrideSetting;
    hoverPreviewSetting: OverrideSetting;
    markdownZipSetting: OverrideSetting;
    spacedRepetitionSetting: OverrideSetting;
  };
  globalSrsTags: string[];
  siteSrsTagsOverride: string[] | null;
  onGlobalGenerationOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', enabled: boolean) => Promise<void>;
  onSiteGenerationOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', setting: OverrideSetting) => Promise<void>;
  onGlobalSrsTagsChange: (tags: string[]) => Promise<void>;
  onSiteSrsTagsChange: (tags: string[] | null) => Promise<void>;

  // Version management
  hasPublishedVersions: boolean;
  onOpenVersionsModal: () => void;

  // Callbacks for coordination
  onBusyChange: (busy: boolean) => void;
  onAuthError: () => void;
  onPublishSuccess?: () => void;

  // Trigger to retry publish after auth error is resolved (increment to trigger)
  retryPublishTrigger?: number;

  // Untracked pages integration
  untrackedPagesCount: number;
  onShowUntrackedPages: () => void;

  // URL param syncing
  onTabChange?: (tab: PreviewModalTab) => void;
  initialTab?: PreviewModalTab;

  // Hooks status
  hooksHaveErrors: boolean;
}

const PreviewPublishModal: React.FC<PreviewPublishModalProps> = ({
  onClose,
  slug,
  startPage,
  globalGenerationOptions,
  siteGenerationOptions,
  globalSrsTags,
  siteSrsTagsOverride,
  onGlobalGenerationOptionChange,
  onSiteGenerationOptionChange,
  onGlobalSrsTagsChange,
  onSiteSrsTagsChange,
  hasPublishedVersions: _hasPublishedVersions,
  onOpenVersionsModal: _onOpenVersionsModal,
  onBusyChange,
  onAuthError,
  onPublishSuccess,
  retryPublishTrigger,
  untrackedPagesCount,
  onShowUntrackedPages,
  onTabChange,
  initialTab,
  hooksHaveErrors,
}) => {
  // Preview operations state
  const [isRegeneratingPreview, setIsRegeneratingPreview] = useState(false);
  const pendingRegenerationRef = useRef(false);
  const [previewResult, setPreviewResult] = useState<{
    success: boolean;
    error?: string;
    traversalPageUrl?: string;
  } | null>(null);
  const [previewProgress, setPreviewProgress] = useState<{
    stage: string;
    message: string;
    progress?: { current: number; total: number; percent: number };
    result?: { success: boolean; traversalPageUrl?: string; error?: string };
  } | null>(null);

  // Busy flag that the provider tab bubbles up (publish/delete/sync in-flight).
  const [providerBusy, setProviderBusy] = useState(false);

  // UI state
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>(() => {
    if (initialTab === 'localExport' || initialTab === 'publish') return 'share';
    return 'review';
  });
  const [previewSubTab, setPreviewSubTab] = useState<PreviewSubTab>(
    initialTab === 'sitePreview' || initialTab === 'changes'
      ? initialTab
      : 'sitePreview'
  );
  const [shareSubTab, setShareSubTab] = useState<ShareSubTab>(
    initialTab === 'localExport' || initialTab === 'publish'
      ? (initialTab as ShareSubTab)
      : 'publish'
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isIframeLoading, setIsIframeLoading] = useState(false);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(null);
  const [previewHistory, setPreviewHistory] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCustomizeSidebarOpen, setIsCustomizeSidebarOpen] = useState(initialTab === 'customization');
  const [customizeSidebarAutoShownDismissed, setCustomizeSidebarAutoShownDismissed] = useState<boolean | null>(null);
  const [customizeSidebarWidth, setCustomizeSidebarWidth] = useState(380);
  const [changesInitialFile, setChangesInitialFile] = useState<string | undefined>(undefined);
  const [previewRootPath, setPreviewRootPath] = useState<string>('');
  const [changedFiles, setChangedFiles] = useState<Set<string>>(new Set());
  const [changedFilesReady, setChangedFilesReady] = useState(false);
  const [impactedPages, setImpactedPages] = useState<string[]>([]);
  const [impactedPagesTotal, setImpactedPagesTotal] = useState(0);
  const changedFilesSnapshotRef = useRef<Set<string> | null>(null);

  // Save changes state
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [saveChangesMessage, setSaveChangesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // "Done" animation state
  const [showPreviewDone, setShowPreviewDone] = useState(false);
  const [previewDoneIsFading, setPreviewDoneIsFading] = useState(false);
  const previewDoneTimeoutsRef = useRef<{ fade?: number; hide?: number }>({});

  // Refresh key for preview changes tab (increment to force tree refresh)
  const [changesTabRefreshKey, setChangesTabRefreshKey] = useState(0);

  // Notify parent of busy state changes
  useEffect(() => {
    onBusyChange(isRegeneratingPreview || providerBusy);
  }, [isRegeneratingPreview, providerBusy, onBusyChange]);

  // Notify parent of tab changes
  useEffect(() => {
    const combinedTab: PreviewModalTab = topLevelTab === 'share' ? shareSubTab : previewSubTab;
    onTabChange?.(combinedTab);
  }, [topLevelTab, previewSubTab, shareSubTab, onTabChange]);

  // Auto-open customize sidebar on first-ever site preview modal open
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/app-config`);
        if (res.ok) {
          const cfg = await res.json();
          const dismissed = cfg.calloutDismissals?.customizeSidebarAutoShown === true;
          setCustomizeSidebarAutoShownDismissed(dismissed);
          if (!dismissed) {
            setIsCustomizeSidebarOpen(true);
          }
        }
      } catch {
        // If we can't load config, don't auto-open
      }
    };
    load();
  }, []);

  // Helper to collect all changed files from tree
  const collectChangedFiles = useCallback((nodes: { path: string; gitStatus?: string; children?: { path: string; gitStatus?: string; children?: unknown[] }[] }[]): string[] => {
    const changed: string[] = [];
    for (const node of nodes) {
      if (node.gitStatus && node.gitStatus !== 'has-changes') {
        changed.push(node.path);
      }
      if (node.children) {
        changed.push(...collectChangedFiles(node.children as { path: string; gitStatus?: string; children?: { path: string; gitStatus?: string; children?: unknown[] }[] }[]));
      }
    }
    return changed;
  }, []);

  // API adapter for preview file explorer (used in changes tab)
  const previewFileExplorerApi: ConfigFileExplorerApi = useMemo(() => ({
    fetchTree: async (options) => {
      const params = new URLSearchParams();
      if (options?.changedOnly) params.set('changedOnly', 'true');
      const url = `${API_BASE_URL}/site/${slug}/preview-files/tree${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch preview file tree');
      const data = await res.json();
      // Capture root path and changed files for use in preview tab
      setPreviewRootPath(data.root || '');
      setChangedFiles(new Set(collectChangedFiles(data.tree || [])));
      return data;
    },
    fetchContent: async (path: string) => {
      const res = await fetch(`${API_BASE_URL}/site/${slug}/file-content?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Failed to fetch file content');
      return res.json();
    },
    fetchOriginal: async (path: string) => {
      const res = await fetch(`${API_BASE_URL}/site/${slug}/file-original?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        return { content: null, path, isNew: true };
      }
      return res.json();
    },
    fetchDirLog: async (dirPath: string, limit = 50) => {
      const res = await fetch(
        `${API_BASE_URL}/site/${slug}/git/dir-log?dir=${encodeURIComponent(dirPath)}&limit=${encodeURIComponent(String(limit))}`
      );
      if (!res.ok) throw new Error('Failed to fetch directory log');
      return res.json();
    },
    fetchCommitFiles: async (sha: string, contextDir: string) => {
      const res = await fetch(
        `${API_BASE_URL}/site/${slug}/git/commit-files?sha=${encodeURIComponent(sha)}&contextDir=${encodeURIComponent(contextDir)}`
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to fetch commit files (${res.status}): ${body || res.statusText}`);
      }
      return res.json();
    },
    fetchCommitFileContent: async (sha: string, pathStr: string, contextDir?: string) => {
      const params = new URLSearchParams({ sha, path: pathStr });
      if (contextDir) params.set('contextDir', contextDir);
      const res = await fetch(`${API_BASE_URL}/site/${slug}/git/commit-file-content?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch commit file content');
      return res.json();
    },
    fetchCommitFileOriginal: async (sha: string, pathStr: string, parentSha?: string | null, contextDir?: string) => {
      const params = new URLSearchParams({ sha, path: pathStr });
      if (parentSha) params.set('parentSha', parentSha);
      if (contextDir) params.set('contextDir', contextDir);
      const res = await fetch(`${API_BASE_URL}/site/${slug}/git/commit-file-original?${params.toString()}`);
      if (!res.ok) {
        return { content: null, path: pathStr, isNew: true };
      }
      return res.json();
    },
    fetchFileLog: async (pathStr: string, limit = 50) => {
      const res = await fetch(
        `${API_BASE_URL}/site/${slug}/git/file-log?path=${encodeURIComponent(pathStr)}&limit=${encodeURIComponent(String(limit))}`
      );
      if (!res.ok) throw new Error('Failed to fetch file log');
      return res.json();
    },
    // Preview files are read-only
  }), [slug, collectChangedFiles]);

  // Fetch preview tree when modal opens to know about changed files
  useEffect(() => {
    if (previewResult?.success && !isRegeneratingPreview) {
      // Trigger a fetch of the preview tree to populate changedFiles.
      // Keep changedFilesReady false until the fetch completes so the
      // Share tab stays disabled during the async gap.
      setChangedFilesReady(false);
      previewFileExplorerApi.fetchTree({ changedOnly: true })
        .then(() => setChangedFilesReady(true))
        .catch((err) => {
          logger.error('Failed to fetch preview tree:', err);
          setChangedFilesReady(true);
        });
    }
  }, [previewResult?.success, isRegeneratingPreview, previewFileExplorerApi]);

  // Reset the preview URL and history when a new preview is generated
  useEffect(() => {
    setCurrentPreviewUrl(null);
    setPreviewHistory([]);
  }, [previewResult?.traversalPageUrl]);

  // Cleanup "done!" fade timeouts on unmount
  useEffect(() => {
    const timeouts = previewDoneTimeoutsRef.current;
    return () => {
      if (timeouts.fade) window.clearTimeout(timeouts.fade);
      if (timeouts.hide) window.clearTimeout(timeouts.hide);
    };
  }, []);

  // Execute preview SSE operation
  const executePreview = useCallback(async () => {
    if (!slug) return;
    if (isRegeneratingPreview) return;

    setIsRegeneratingPreview(true);
    setIsIframeLoading(true);
    setPreviewProgress({ stage: 'preparing', message: 'Preparing to render preview...' });

    try {
      await new Promise<void>((resolve) => {
        const params = new URLSearchParams();
        if (startPage) {
          params.set('startPageTitle', startPage.title);
          params.set('startPageDirectory', startPage.sourceGraphSubdirectory || '');
        }

        const url = startPage
          ? `${API_BASE_URL}/site/${slug}/preview-stream?${params.toString()}`
          : `${API_BASE_URL}/site/${slug}/preview-stream`;

        const eventSource = new EventSource(url);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as {
              stage: string;
              message: string;
              progress?: { current: number; total: number; percent: number };
              result?: { success: boolean; traversalPageUrl?: string; error?: string };
            };

            setPreviewProgress(data);

            // As soon as the server tells us the start page URL, show it.
            if (data.result?.traversalPageUrl) {
              setPreviewResult({ success: true, traversalPageUrl: data.result.traversalPageUrl });
              setCurrentPreviewUrl(data.result.traversalPageUrl);
            }

            if (data.stage === 'complete' || data.stage === 'error' || data.stage === 'cancelled') {
              eventSource.close();
              if (data.stage === 'error') {
                setPreviewResult({ success: false, error: data.result?.error || data.message || 'Failed to generate preview' });
              }
              resolve();
            }
          } catch (err) {
            logger.error('Failed to parse preview progress event:', err);
          }
        };

        eventSource.onerror = () => {
          setPreviewProgress({
            stage: 'error',
            message: 'Lost connection while generating preview',
            result: { success: false, error: 'Lost connection while generating preview' }
          });
          eventSource.close();
          setPreviewResult({ success: false, error: 'Lost connection while generating preview' });
          resolve();
        };
      });
    } catch (error) {
      setPreviewResult({
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      });
    } finally {
      setIsRegeneratingPreview(false);
      setIsIframeLoading(false);
    }
  }, [slug, startPage, isRegeneratingPreview]);

  // Get the current page's file path from the preview URL
  const getCurrentPreviewFilePath = useCallback((): string | null => {
    const currentUrl = currentPreviewUrl || previewResult?.traversalPageUrl;
    if (!currentUrl || !previewRootPath) return null;

    try {
      const url = new URL(currentUrl);
      const pathname = decodeURIComponent(url.pathname);
      const previewMatch = pathname.match(/\/(preview|published)\/(.+)$/);
      if (previewMatch) {
        const relativePath = previewMatch[2];
        return `${previewRootPath}/${relativePath}`;
      }
    } catch {
      // Invalid URL
    }
    return null;
  }, [currentPreviewUrl, previewResult?.traversalPageUrl, previewRootPath]);

  // Check if current preview page has changes
  const currentPreviewPageHasChanges = useMemo(() => {
    const filePath = getCurrentPreviewFilePath();
    return filePath ? changedFiles.has(filePath) : false;
  }, [getCurrentPreviewFilePath, changedFiles]);

  // Regenerate preview and reload (used when options change)
  const regeneratePreviewAndReload = useCallback(async () => {
    if (!slug) return;
    if (isRegeneratingPreview) {
      // Queue a regeneration for when the current one finishes
      pendingRegenerationRef.current = true;
      return;
    }

    // Snapshot current changed files to detect impacted pages after regeneration
    changedFilesSnapshotRef.current = new Set(changedFiles);
    setImpactedPages([]);
    setImpactedPagesTotal(0);

    setIsRegeneratingPreview(true);
    setIsIframeLoading(true);
    setPreviewProgress({ stage: 'preparing', message: 'Preparing to render preview...' });

    const completion = await new Promise<{ stage: 'complete' | 'error'; traversalPageUrl?: string }>((resolve) => {
      // Pass the current page path so the backend renders it first
      const currentFilePath = getCurrentPreviewFilePath();
      let streamUrl = `${API_BASE_URL}/site/${slug}/preview-stream`;
      if (currentFilePath && previewRootPath) {
        const relativePath = currentFilePath.startsWith(previewRootPath)
          ? currentFilePath.slice(previewRootPath.length + 1)
          : currentFilePath;
        if (relativePath) {
          streamUrl += `?startPagePath=${encodeURIComponent(relativePath)}`;
        }
      }
      const eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            stage: string;
            message: string;
            progress?: { current: number; total: number; percent: number };
            result?: { success: boolean; traversalPageUrl?: string; error?: string };
          };

          setPreviewProgress(data);

          if (data.stage === 'complete' || data.stage === 'error') {
            eventSource.close();
            resolve({
              stage: data.stage,
              traversalPageUrl: data.result?.traversalPageUrl
            });
          }
        } catch (err) {
          logger.error('Failed to parse preview progress event:', err);
        }
      };

      eventSource.onerror = () => {
        setPreviewProgress({
          stage: 'error',
          message: 'Lost connection while generating preview',
          result: { success: false, error: 'Lost connection while generating preview' }
        });
        eventSource.close();
        resolve({ stage: 'error' });
      };
    });

    // Reload the iframe if generation succeeded
    if (completion.stage === 'complete') {
      const newTraversalUrl = completion.traversalPageUrl;
      if (newTraversalUrl) {
        setPreviewResult({ success: true, traversalPageUrl: newTraversalUrl });
      }

      // Stay on the current page if possible; only fall back to the new traversal URL
      const stayUrl = currentPreviewUrl || newTraversalUrl || previewResult?.traversalPageUrl;
      if (stayUrl) {
        const url = new URL(stayUrl);
        url.searchParams.set('_t', Date.now().toString());
        setCurrentPreviewUrl(url.toString());
      }

      // Show a quick "done!" that fades away
      setShowPreviewDone(true);
      setPreviewDoneIsFading(false);
      if (previewDoneTimeoutsRef.current.fade) window.clearTimeout(previewDoneTimeoutsRef.current.fade);
      if (previewDoneTimeoutsRef.current.hide) window.clearTimeout(previewDoneTimeoutsRef.current.hide);
      previewDoneTimeoutsRef.current.fade = window.setTimeout(() => setPreviewDoneIsFading(true), 700);
      previewDoneTimeoutsRef.current.hide = window.setTimeout(() => setShowPreviewDone(false), 1400);

      // Refresh the changed files count after regeneration, then compute impacted pages
      previewFileExplorerApi.fetchTree({ changedOnly: true })
        .then((data) => {
          const snapshot = changedFilesSnapshotRef.current;
          if (snapshot && data?.tree) {
            const newChangedFiles = new Set(collectChangedFiles(data.tree));
            const newlyChanged = [...newChangedFiles].filter(
              f => !snapshot.has(f) && f.endsWith('.html')
            );
            setImpactedPages(newlyChanged.slice(0, 5));
            setImpactedPagesTotal(newlyChanged.length);
          }
          changedFilesSnapshotRef.current = null;
        })
        .catch((err) => logger.error('Failed to refresh changed files:', err));
    }

    setIsRegeneratingPreview(false);
    setIsIframeLoading(false);
  }, [slug, isRegeneratingPreview, currentPreviewUrl, previewResult?.traversalPageUrl, previewFileExplorerApi, getCurrentPreviewFilePath, previewRootPath, changedFiles, collectChangedFiles]);

  // Drain pending regeneration: if something requested a regeneration while
  // one was in progress, run it now that the previous one has finished.
  useEffect(() => {
    if (!isRegeneratingPreview && pendingRegenerationRef.current) {
      pendingRegenerationRef.current = false;
      void regeneratePreviewAndReload();
    }
  }, [isRegeneratingPreview, regeneratePreviewAndReload]);

  // Handle save changes (commit to git without publishing)
  const handleSaveChanges = useCallback(async () => {
    if (!slug) return;
    if (isSavingChanges) return;

    setIsSavingChanges(true);
    setSaveChangesMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/site/${slug}/save-changes`);
      const data = await res.json();

      if (!res.ok) {
        setSaveChangesMessage({ type: 'error', text: data.error || 'Failed to save changes' });
      } else if (data.skipped) {
        setSaveChangesMessage({ type: 'success', text: 'Git auto-management is disabled' });
      } else if (data.noChanges) {
        setSaveChangesMessage({ type: 'success', text: 'No changes to save' });
      } else {
        setSaveChangesMessage({ type: 'success', text: 'Changes saved' });
        // Refresh the changed files count after successful save
        await previewFileExplorerApi.fetchTree({ changedOnly: true }).catch((err) => logger.error('Failed to refresh changed files:', err));
        // Increment refresh key to force changes tab remount and refresh
        setChangesTabRefreshKey((prev) => prev + 1);
        // Automatically move to the Share step after saving
        setTopLevelTab('share');
      }

      // Clear message after 3 seconds
      setTimeout(() => setSaveChangesMessage(null), 3000);
    } catch (error) {
      setSaveChangesMessage({ type: 'error', text: error instanceof Error ? error.message : 'Network error' });
      setTimeout(() => setSaveChangesMessage(null), 3000);
    } finally {
      setIsSavingChanges(false);
    }
  }, [slug, isSavingChanges, previewFileExplorerApi]);

  // Handle closing the modal — unmount resets all state automatically
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setIsIframeLoading(false);

    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow?.location?.href) {
        const iframeUrl = iframe.contentWindow.location.href;
        const expectedUrl = currentPreviewUrl || previewResult?.traversalPageUrl;

        if (expectedUrl && iframeUrl !== expectedUrl && iframeUrl !== 'about:blank') {
          setPreviewHistory(prev => [...prev, expectedUrl]);
          setCurrentPreviewUrl(iframeUrl);
        }
      }
    } catch (e) {
      logger.debug('Could not read iframe URL (cross-origin):', e);
    }
  }, [currentPreviewUrl, previewResult?.traversalPageUrl]);

  // Navigate back in preview history
  const handlePreviewBack = useCallback(() => {
    if (previewHistory.length === 0) return;

    const newHistory = [...previewHistory];
    const previousUrl = newHistory.pop();
    setPreviewHistory(newHistory);
    setCurrentPreviewUrl(previousUrl || null);
  }, [previewHistory]);

  // Handle preview from changes tab
  const handlePreviewFromChanges = useCallback((filePath: string) => {
    if (!previewRootPath || !previewResult?.traversalPageUrl) return;

    const relativePath = filePath.startsWith(previewRootPath)
      ? filePath.slice(previewRootPath.length + 1)
      : filePath;

    const publishedIndex = previewResult.traversalPageUrl.indexOf('/published/');
    const baseUrl = publishedIndex !== -1
      ? previewResult.traversalPageUrl.substring(0, publishedIndex + '/published/'.length)
      : previewResult.traversalPageUrl.substring(0, previewResult.traversalPageUrl.lastIndexOf('/') + 1);
    const previewUrl = `${baseUrl}${encodePathForUrl(relativePath)}`;

    setCurrentPreviewUrl(previewUrl);
    setPreviewSubTab('sitePreview');
  }, [previewRootPath, previewResult?.traversalPageUrl]);

  // Handle view changes from preview tab
  const handleViewChangesFromPreview = useCallback((filePath: string) => {
    setChangesInitialFile(filePath);
    setPreviewSubTab('changes');
  }, []);

  // Handle opening preview in external browser
  const previewUrl = currentPreviewUrl || previewResult?.traversalPageUrl;

  const handleOpenPreviewExternal = useCallback(async () => {
    if (previewUrl) {
      await openExternal(previewUrl, 'sitePreview');
    } else {
      logger.warn('[PreviewPublishModal] No preview URL available to open externally');
    }
  }, [previewUrl]);

  // Let the provider tab ask the outer modal to switch to the changes view.
  const handleViewChanges = useCallback(() => {
    setTopLevelTab('review');
    setPreviewSubTab('changes');
  }, []);

  // Wrappers for option changes that trigger regeneration
  const handleGlobalOptionChange = useCallback(async (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', enabled: boolean) => {
    await onGlobalGenerationOptionChange(option, enabled);
    await regeneratePreviewAndReload();
  }, [onGlobalGenerationOptionChange, regeneratePreviewAndReload]);

  const handleSiteOptionChange = useCallback(async (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', setting: OverrideSetting) => {
    await onSiteGenerationOptionChange(option, setting);
    await regeneratePreviewAndReload();
  }, [onSiteGenerationOptionChange, regeneratePreviewAndReload]);

  const handleGlobalSrsTagsChange = useCallback(async (tags: string[]) => {
    await onGlobalSrsTagsChange(tags);
    await regeneratePreviewAndReload();
  }, [onGlobalSrsTagsChange, regeneratePreviewAndReload]);

  const handleSiteSrsTagsChange = useCallback(async (tags: string[] | null) => {
    await onSiteSrsTagsChange(tags);
    await regeneratePreviewAndReload();
  }, [onSiteSrsTagsChange, regeneratePreviewAndReload]);

  const handleGlobalSrsEnable = useCallback(async (tags: string[]) => {
    await onGlobalGenerationOptionChange('spacedRepetition', true);
    await onGlobalSrsTagsChange(tags);
    await regeneratePreviewAndReload();
  }, [onGlobalGenerationOptionChange, onGlobalSrsTagsChange, regeneratePreviewAndReload]);

  const handleSiteSrsEnable = useCallback(async (setting: OverrideSetting, tags: string[]) => {
    await onSiteGenerationOptionChange('spacedRepetition', setting);
    await onSiteSrsTagsChange(tags);
    await regeneratePreviewAndReload();
  }, [onSiteGenerationOptionChange, onSiteSrsTagsChange, regeneratePreviewAndReload]);

  // Handle refresh from external editor changes
  const handleCustomizeRefresh = useCallback(async () => {
    // Clear server-side hooks cache so regeneration picks up file changes from disk
    try {
      await fetch(`${API_BASE_URL}/hooks/clear-cache`, { method: 'POST' });
    } catch (err) {
      logger.error('Failed to clear hooks cache:', err);
    }
    // Regenerate preview (this also detects impacted pages)
    await regeneratePreviewAndReload();
  }, [regeneratePreviewAndReload]);

  // Handle sidebar resize drag
  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = customizeSidebarWidth;

    // Disable pointer events on iframe during drag
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = 'none';
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(600, Math.max(340, startWidth + delta));
      setCustomizeSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (iframeRef.current) {
        iframeRef.current.style.pointerEvents = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [customizeSidebarWidth]);

  // Start preview on mount — ref prevents re-triggering when executePreview
  // reference changes due to dependency updates.
  const hasStartedPreview = useRef(false);
  useEffect(() => {
    if (!hasStartedPreview.current) {
      hasStartedPreview.current = true;
      executePreview();
    }
  }, [executePreview]);

  const ExternalLinkIcon = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15,3 21,3 21,9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  const activeProvider = useActivePublishingProvider();
  const PublishTabComponent = activeProvider?.PublishTabComponent ?? null;
  const publishTabLabel = activeProvider?.manifest.publishTabLabel ?? 'Publish';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg px-6 pt-8 pb-6 w-4/5 h-4/5 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - top right */}
        <div className="absolute top-3 right-4">
          <button
            onClick={handleClose}
            className="text-neutral-500 hover:text-neutral-700 text-xl"
          >
            ×
          </button>
        </div>

        {/* Progress indicator - absolutely positioned, left-justified with fade */}
        {/* Only shows for preview regeneration - publishing progress is shown in the Publish tab */}
        <div
          className={`absolute left-6 top-9 transition-opacity duration-300 ${
            isRegeneratingPreview ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <HtmlGenerationProgress
            isPublishing={false}
            isRegeneratingPreview={isRegeneratingPreview}
            publishProgress={null}
            previewProgress={previewProgress}
          />
        </div>
        {/* "Done" indicator - absolutely positioned with fade */}
        <div
          className={`absolute left-6 top-9 transition-opacity duration-700 ${
            !isRegeneratingPreview && showPreviewDone
              ? previewDoneIsFading ? 'opacity-0' : 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="text-sm text-success-700">
            done!
          </div>
        </div>

        {/* Untracked Pages Alert - shown above the process steps */}
        {previewResult?.success && untrackedPagesCount > 0 && (
          <div className="flex justify-center mb-3">
            <UntrackedPagesButton
              untrackedCount={untrackedPagesCount}
              onClick={onShowUntrackedPages}
              showActionLink
            />
          </div>
        )}

        {/* Process steps indicator (Review → Share) */}
        {previewResult?.success && (
          <div className="flex items-center justify-center gap-3 mb-6">
            {/* Step 1: Review */}
            <button
              onClick={() => {
                setTopLevelTab('review');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                topLevelTab === 'review'
                  ? 'bg-main-100 text-main-700 font-medium'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-sm font-medium ${
                topLevelTab === 'review'
                  ? 'bg-main-600 text-white'
                  : 'bg-neutral-300 text-neutral-600'
              }`}>
                1
              </span>
              <span>Review</span>
            </button>

            {/* Arrow connector */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={changedFiles.size > 0 || isRegeneratingPreview || !changedFilesReady ? 'text-neutral-200' : 'text-neutral-400'}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>

            {/* Step 2: Share */}
            <DisabledTooltip
              disabled={changedFiles.size > 0 || isRegeneratingPreview || !changedFilesReady}
              tooltip={changedFiles.size > 0 ? 'Save your changes before sharing' : isRegeneratingPreview || !changedFilesReady ? 'Wait for preview to finish generating' : undefined}
            >
              <button
                onClick={() => changedFiles.size === 0 && !isRegeneratingPreview && changedFilesReady && setTopLevelTab('share')}
                disabled={changedFiles.size > 0 || isRegeneratingPreview || !changedFilesReady}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  changedFiles.size > 0 || isRegeneratingPreview || !changedFilesReady
                    ? 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
                    : topLevelTab === 'share'
                      ? 'bg-main-100 text-main-700 font-medium'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-sm font-medium ${
                  changedFiles.size > 0 || isRegeneratingPreview || !changedFilesReady
                    ? 'bg-neutral-200 text-neutral-400'
                    : topLevelTab === 'share'
                      ? 'bg-main-600 text-white'
                      : 'bg-neutral-300 text-neutral-600'
                }`}>
                  2
                </span>
                <span>Share</span>
              </button>
            </DisabledTooltip>
          </div>
        )}

        {/* Review subtab navigation */}
        {topLevelTab === 'review' && previewResult?.success && (
          <div className="border-b mb-4">
            <nav className="flex justify-between items-center">
              <div className="flex space-x-4">
                <button
                  className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    previewSubTab === 'sitePreview'
                      ? 'border-main-500 text-main-600'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                  onClick={() => {
                    setPreviewSubTab('sitePreview');
                    setChangesInitialFile(undefined);
                  }}
                >
                  Site Preview
                </button>
                <button
                  className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                    previewSubTab === 'changes'
                      ? 'border-main-500 text-main-600'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                  onClick={() => {
                    logger.debug('[PreviewPublishModal] Changes tab clicked, switching to changes tab');
                    setPreviewSubTab('changes');
                  }}
                >
                  Changes
                  {isRegeneratingPreview ? (
                    <span className="ml-1.5 animate-spin h-3.5 w-3.5 border-2 border-neutral-300 border-t-main-500 rounded-full inline-block relative top-[3px]" />
                  ) : (
                    changedFiles.size > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-neutral-200 text-neutral-700 rounded-full">
                        {changedFiles.size}
                      </span>
                    )
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 pb-2">
                {saveChangesMessage && (
                  <span className={`text-sm ${saveChangesMessage.type === 'error' ? 'text-danger-600' : 'text-neutral-600'}`}>
                    {saveChangesMessage.text}
                  </span>
                )}
                <DisabledTooltip disabled={changedFiles.size === 0} tooltip="No changes to save">
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSavingChanges || changedFiles.size === 0}
                    className="px-3 py-1 bg-btn-standard-normal text-btn-standard-text text-sm rounded font-medium hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingChanges ? 'Saving...' : 'Save Changes'}
                  </button>
                </DisabledTooltip>
              </div>
            </nav>
          </div>
        )}

        {/* Back button and Open in Browser for preview */}
        {topLevelTab === 'review' && previewSubTab === 'sitePreview' && previewResult?.success && (
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <DisabledTooltip disabled={previewHistory.length === 0} tooltip="No history" align="left">
                <button
                  onClick={handlePreviewBack}
                  disabled={previewHistory.length === 0}
                  className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                    previewHistory.length === 0
                      ? 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-800'
                  }`}
                  title={previewHistory.length > 0 ? 'Go back' : undefined}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                </button>
              </DisabledTooltip>

              {/* View changes button - appears when current page has uncommitted changes */}
              {currentPreviewPageHasChanges && (
                <button
                  onClick={() => {
                    const filePath = getCurrentPreviewFilePath();
                    if (filePath) {
                      handleViewChangesFromPreview(filePath);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm bg-neutral-100 text-neutral-600 border border-neutral-300 rounded hover:bg-neutral-200 transition-colors"
                  title="This page has uncommitted changes - click to view diff"
                >
                  <span className="text-neutral-500">M</span>
                  <span>View Changes</span>
                </button>
              )}
            </div>

            {/* Open in Browser button */}
            <button
              onClick={handleOpenPreviewExternal}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-neutral-600 hover:text-neutral-800 transition-colors"
              title="Open in browser"
            >
              <ExternalLinkIcon />
              <span>Open in Browser</span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {previewResult?.success && previewResult.traversalPageUrl ? (
            topLevelTab === 'share' ? (
              // Share tab content with subtabs
              <div className="h-full flex flex-col">
                {/* Share subtab navigation */}
                <div className="border-b mb-4">
                  <nav className="flex space-x-4 items-center">
                    <button
                      className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        shareSubTab === 'publish'
                          ? 'border-main-500 text-main-600'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                      onClick={() => setShareSubTab('publish')}
                    >
                      {publishTabLabel}
                    </button>
                    <button
                      className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        shareSubTab === 'localExport'
                          ? 'border-main-500 text-main-600'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                      onClick={() => {
                        setShareSubTab('localExport');
                      }}
                    >
                      Local Export
                    </button>
                    <button
                      className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        shareSubTab === 'advanced'
                          ? 'border-main-500 text-main-600'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                      onClick={() => setShareSubTab('advanced')}
                    >
                      Advanced
                    </button>
                  </nav>
                </div>

                {/* Share subtab content */}
                <div className="flex-1 overflow-hidden">
                  {shareSubTab === 'advanced' ? (
                    <AdvancedTab siteSlug={slug || ''} />
                  ) : shareSubTab === 'localExport' ? (
                    <SaveLocallyTab siteSlug={slug || ''} />
                  ) : shareSubTab === 'publish' && PublishTabComponent ? (
                    <PublishTabComponent
                      siteSlug={slug || ''}
                      changedFilesCount={changedFiles.size}
                      onBusyChange={setProviderBusy}
                      onAuthError={onAuthError}
                      onPublishSuccess={onPublishSuccess}
                      onViewChanges={handleViewChanges}
                      retryPublishTrigger={retryPublishTrigger}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-row">
                {/* Main content area */}
                <div className="flex-1 min-w-0 h-full">
                  {previewSubTab === 'sitePreview' ? (
                    <iframe
                      ref={iframeRef}
                      src={currentPreviewUrl || previewResult.traversalPageUrl}
                      className="w-full h-full border rounded"
                      title="Preview"
                      onLoad={handleIframeLoad}
                    />
                  ) : previewSubTab === 'changes' ? (
                    <PreviewChangesTab
                      slug={slug}
                      isActive={topLevelTab === 'review' && previewSubTab === 'changes'}
                      isRegeneratingPreview={isRegeneratingPreview}
                      publishSuccess={!!previewResult?.success}
                      baseApi={previewFileExplorerApi}
                      initialFile={changesInitialFile}
                      onPreviewFile={handlePreviewFromChanges}
                      refreshKey={changesTabRefreshKey}
                    />
                  ) : null}
                </div>

                {/* Customize sidebar */}
                <CustomizeSidebar
                  isOpen={isCustomizeSidebarOpen}
                  onToggle={() => {
                    setIsCustomizeSidebarOpen(prev => {
                      const willClose = prev;
                      // When closing for the first time, save dismissal so it won't auto-open again
                      if (willClose && customizeSidebarAutoShownDismissed === false) {
                        setCustomizeSidebarAutoShownDismissed(true);
                        fetch(`${API_BASE_URL}/app-config/callout-dismissal/customizeSidebarAutoShown`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ dismissed: true }),
                        }).catch(err => logger.error('Failed to save customize sidebar dismissal:', err));
                      }
                      return !prev;
                    });
                  }}
                  width={customizeSidebarWidth}
                  siteSlug={slug || ''}
                  hooksHaveErrors={hooksHaveErrors}
                  globalGenerationOptions={globalGenerationOptions}
                  siteGenerationOptions={siteGenerationOptions}
                  globalSrsTags={globalSrsTags}
                  siteSrsTagsOverride={siteSrsTagsOverride}
                  onGlobalOptionChange={handleGlobalOptionChange}
                  onSiteOptionChange={handleSiteOptionChange}
                  onGlobalSrsTagsChange={handleGlobalSrsTagsChange}
                  onSiteSrsTagsChange={handleSiteSrsTagsChange}
                  onGlobalSrsEnable={handleGlobalSrsEnable}
                  onSiteSrsEnable={handleSiteSrsEnable}
                  disabled={providerBusy || isRegeneratingPreview}
                  onPresetChanged={regeneratePreviewAndReload}
                  onCustomAssetsChanged={regeneratePreviewAndReload}
                  onHooksChanged={regeneratePreviewAndReload}
                  impactedPages={impactedPages}
                  impactedPagesTotal={impactedPagesTotal}
                  onNavigateToPage={handlePreviewFromChanges}
                  onRefresh={handleCustomizeRefresh}
                  isRefreshing={isRegeneratingPreview}
                  onResizeStart={handleSidebarResizeStart}
                />
              </div>
            )
          ) : isRegeneratingPreview ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-main-600 mb-4"></div>
                <p className="text-neutral-600">Generating preview...</p>
              </div>
            </div>
          ) : (
            <div className="text-danger-600">
              <p>Error: {previewResult?.error || 'Unknown error occurred'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreviewPublishModal;
