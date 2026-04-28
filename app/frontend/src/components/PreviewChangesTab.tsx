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
import { ConfigFileExplorer, ConfigFileExplorerApi } from '../../../shared_components/ConfigFileExplorer';
import type { FileNode, FileTreeResponse } from '../../../shared_components/ConfigFileExplorer';
import { ToolbarIconButton } from '../../../shared_components/ToolbarIconButton';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';

type HtmlSectionKey = 'head' | 'header' | 'main' | 'footer';
type HtmlSectionChanges = Record<HtmlSectionKey, boolean>;
type ChangeTypeKey = 'added' | 'modified' | 'deleted';

interface PreviewChangesTabProps {
  slug: string;
  isActive: boolean; // true when this tab is visible
  isRegeneratingPreview: boolean;
  publishSuccess: boolean;
  baseApi: ConfigFileExplorerApi;
  initialFile?: string;
  onPreviewFile?: (path: string) => void;
  /** Increment to force tree refresh (e.g. after save) */
  refreshKey: number;
}

// Error boundary for catching rendering errors in changes tab
class ChangesTabErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    logger.error('[ChangesTabErrorBoundary] Error caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`[ChangesTabErrorBoundary] Error details: ${error.message}, componentStack: ${errorInfo.componentStack}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-danger-600">
          <h2 className="font-bold">Something went wrong in the Changes tab</h2>
          <pre className="mt-2 text-sm bg-danger-50 p-2 rounded overflow-auto">
            {this.state.error?.message}
            {'\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const PreviewChangesTab: React.FC<PreviewChangesTabProps> = ({
  slug,
  isActive,
  isRegeneratingPreview,
  publishSuccess,
  baseApi,
  initialFile,
  onPreviewFile,
  refreshKey,
}) => {
  // HTML section filtering state
  const [htmlSectionFilters, setHtmlSectionFilters] = useState<HtmlSectionChanges>({
    head: true,
    header: true,
    main: true,
    footer: true,
  });
  const [htmlSectionChangesMap, setHtmlSectionChangesMap] = useState<Record<string, HtmlSectionChanges>>({});
  const [htmlSectionChangesLoading, setHtmlSectionChangesLoading] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [htmlSectionChangesEpoch, setHtmlSectionChangesEpoch] = useState(0);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Change type filtering state
  const [changeTypeFilters, setChangeTypeFilters] = useState<Record<ChangeTypeKey, boolean>>({
    added: true,
    modified: true,
    deleted: true,
  });
  const [changeTypeCounts, setChangeTypeCounts] = useState<Record<ChangeTypeKey, number>>({
    added: 0,
    modified: 0,
    deleted: 0,
  });

  // Visible HTML section counts (reflects only files passing change type filter)
  const [visibleHtmlSectionCounts, setVisibleHtmlSectionCounts] = useState<Record<HtmlSectionKey, number>>({
    head: 0, header: 0, main: 0, footer: 0,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!filterDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterDropdownOpen]);

  // Fetch HTML section changes when tab is active
  useEffect(() => {
    if (!slug || !publishSuccess || isRegeneratingPreview || !isActive) return;

    setHtmlSectionChangesLoading(true);
    fetch(`${API_BASE_URL}/site/${slug}/preview-files/html-section-changes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch HTML section changes (${res.status})`);
        return res.json() as Promise<{ files: Array<{ path: string; sections: HtmlSectionChanges }> }>;
      })
      .then((data) => {
        const map: Record<string, HtmlSectionChanges> = {};
        for (const f of data.files || []) {
          if (f?.path && f.sections) {
            map[f.path] = f.sections;
          }
        }
        setHtmlSectionChangesMap(map);
        setHtmlSectionChangesEpoch((v) => v + 1);
      })
      .catch((err) => {
        logger.error('Failed to load HTML section changes:', err);
        setHtmlSectionChangesMap({});
        setHiddenCount(0);
      })
      .finally(() => {
        setHtmlSectionChangesLoading(false);
      });
  }, [slug, publishSuccess, isRegeneratingPreview, isActive]);

  const toggleHtmlSectionFilter = useCallback((key: HtmlSectionKey) => {
    setHtmlSectionFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleChangeTypeFilter = useCallback((key: ChangeTypeKey) => {
    setChangeTypeFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sectionFilterKey = useMemo(() => {
    return [
      htmlSectionFilters.head ? '1' : '0',
      htmlSectionFilters.header ? '1' : '0',
      htmlSectionFilters.main ? '1' : '0',
      htmlSectionFilters.footer ? '1' : '0',
    ].join('');
  }, [htmlSectionFilters]);

  const changeTypeFilterKey = useMemo(() => {
    return [
      changeTypeFilters.added ? '1' : '0',
      changeTypeFilters.modified ? '1' : '0',
      changeTypeFilters.deleted ? '1' : '0',
    ].join('');
  }, [changeTypeFilters]);

  const displayedHtmlSections = useMemo(() => {
    return ([
      { key: 'head' as HtmlSectionKey, label: '<head>' },
      { key: 'header' as HtmlSectionKey, label: '<header>' },
      { key: 'main' as HtmlSectionKey, label: '<main>' },
      { key: 'footer' as HtmlSectionKey, label: '<footer>' },
    ]).filter(({ key }) => visibleHtmlSectionCounts[key] > 0);
  }, [visibleHtmlSectionCounts]);

  // Tree filtering helpers
  const filterTree = useCallback((nodes: FileNode[], predicate: (node: FileNode) => boolean): FileNode[] => {
    const out: FileNode[] = [];
    for (const node of nodes) {
      if (node.type === 'directory') {
        const children = node.children ? filterTree(node.children, predicate) : [];
        if (children.length > 0) {
          out.push({ ...node, children });
        }
      } else {
        if (predicate(node)) out.push(node);
      }
    }
    return out;
  }, []);

  const countFilesByChangeType = useCallback((nodes: FileNode[]): Record<ChangeTypeKey, number> => {
    const counts: Record<ChangeTypeKey, number> = { added: 0, modified: 0, deleted: 0 };
    for (const node of nodes) {
      if (node.type === 'file' && node.gitStatus && node.gitStatus !== 'has-changes') {
        if (node.gitStatus === 'new' || node.gitStatus === 'staged-new') counts.added++;
        else if (node.gitStatus === 'modified' || node.gitStatus === 'staged-modified') counts.modified++;
        else if (node.gitStatus === 'deleted') counts.deleted++;
      }
      if (node.children) {
        const childCounts = countFilesByChangeType(node.children);
        counts.added += childCounts.added;
        counts.modified += childCounts.modified;
        counts.deleted += childCounts.deleted;
      }
    }
    return counts;
  }, []);

  const countAllChangedFiles = useCallback((nodes: FileNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      if (node.type === 'file' && node.gitStatus && node.gitStatus !== 'has-changes') {
        count++;
      }
      if (node.children) count += countAllChangedFiles(node.children);
    }
    return count;
  }, []);

  const passesChangeTypeFilter = useCallback((node: FileNode): boolean => {
    if (!node.gitStatus || node.gitStatus === 'has-changes') return true;
    if (node.gitStatus === 'new' || node.gitStatus === 'staged-new') return changeTypeFilters.added;
    if (node.gitStatus === 'modified' || node.gitStatus === 'staged-modified') return changeTypeFilters.modified;
    if (node.gitStatus === 'deleted') return changeTypeFilters.deleted;
    return true;
  }, [changeTypeFilters]);

  // Filtered API adapter
  const filteredApi: ConfigFileExplorerApi = useMemo(() => ({
    ...baseApi,
    fetchTree: async (options) => {
      const data = (await baseApi.fetchTree(options)) as FileTreeResponse;

      if (!options?.changedOnly) {
        setHiddenCount(0);
        return data;
      }

      const rawTree = data.tree || [];

      // 1. Compute change type counts from raw tree
      setChangeTypeCounts(countFilesByChangeType(rawTree));

      // 2. Apply change type filter
      const afterChangeTypeFilter = filterTree(rawTree, passesChangeTypeFilter);

      // 3. Compute visible HTML section counts (from files passing change type filter)
      const visCounts: Record<HtmlSectionKey, number> = { head: 0, header: 0, main: 0, footer: 0 };
      if (htmlSectionChangesMap && Object.keys(htmlSectionChangesMap).length > 0) {
        const countSections = (nodes: FileNode[]) => {
          for (const node of nodes) {
            if (node.type === 'file') {
              const changes = htmlSectionChangesMap[node.path];
              if (changes) {
                if (changes.head) visCounts.head++;
                if (changes.header) visCounts.header++;
                if (changes.main) visCounts.main++;
                if (changes.footer) visCounts.footer++;
              }
            }
            if (node.children) countSections(node.children);
          }
        };
        countSections(afterChangeTypeFilter);
      }
      setVisibleHtmlSectionCounts(visCounts);

      // 4. Apply HTML section filter (only to HTML files)
      let finalTree = afterChangeTypeFilter;
      if (htmlSectionChangesMap && Object.keys(htmlSectionChangesMap).length > 0) {
        finalTree = filterTree(afterChangeTypeFilter, (node) => {
          if (!node.name.toLowerCase().endsWith('.html')) return true;
          const changes = htmlSectionChangesMap[node.path];
          if (!changes) return true;
          return (
            (htmlSectionFilters.head && changes.head) ||
            (htmlSectionFilters.header && changes.header) ||
            (htmlSectionFilters.main && changes.main) ||
            (htmlSectionFilters.footer && changes.footer)
          );
        });
      }

      // 5. Compute hidden count
      const totalChanged = countAllChangedFiles(rawTree);
      const visibleChanged = countAllChangedFiles(finalTree);
      setHiddenCount(Math.max(0, totalChanged - visibleChanged));

      return { ...data, tree: finalTree };
    },
  }), [baseApi, htmlSectionChangesMap, htmlSectionFilters, filterTree, countFilesByChangeType, countAllChangedFiles, passesChangeTypeFilter]);

  if (isRegeneratingPreview) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500">
        <span className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-main-500 rounded-full inline-block mb-3" />
        <span>Changes will appear once HTML generation completes</span>
      </div>
    );
  }

  return (
    <ChangesTabErrorBoundary>
      <div className="h-full">
        <ConfigFileExplorer
          key={`${initialFile || 'default'}-${sectionFilterKey}-${changeTypeFilterKey}-${htmlSectionChangesEpoch}-${refreshKey}`}
          api={filteredApi}
          showPath={false}
          showHeader={true}
          compactHeader={true}
          headerLeftContent={
            <div className="flex items-center gap-2">
              {/* Filter dropdown */}
              <div className="relative" ref={filterDropdownRef}>
                <ToolbarIconButton
                  onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                  disabled={htmlSectionChangesLoading}
                  active={filterDropdownOpen}
                  title="Filter changes"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                </ToolbarIconButton>
                {filterDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[220px]">
                    {/* Change Type section */}
                    <div className="text-xs font-medium text-neutral-500 mb-2">Change Type</div>
                    <div className="space-y-1.5">
                      {([
                        { key: 'added' as ChangeTypeKey, label: 'Added', badge: 'A', badgeClass: 'text-success-500' },
                        { key: 'modified' as ChangeTypeKey, label: 'Modified', badge: 'M', badgeClass: 'text-warning-500' },
                        { key: 'deleted' as ChangeTypeKey, label: 'Deleted', badge: 'D', badgeClass: 'text-danger-500' },
                      ]).map(({ key, label, badge, badgeClass }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={changeTypeFilters[key]}
                            onChange={() => toggleChangeTypeFilter(key)}
                            className="w-4 h-4 text-main-600 border-neutral-300 rounded focus:ring-main-500"
                          />
                          <span className={`text-xs font-bold w-4 text-center ${badgeClass}`}>{badge}</span>
                          <span className="flex-1 text-sm text-neutral-700">{label}</span>
                          <span className="text-xs text-neutral-400 tabular-nums">{changeTypeCounts[key]}</span>
                        </label>
                      ))}
                    </div>
                    {/* Divider */}
                    <div className="border-t border-neutral-200 my-2.5" />
                    {/* HTML Sections section */}
                    <div className="text-xs font-medium text-neutral-500 mb-2">HTML Section</div>
                    {displayedHtmlSections.length > 0 ? (
                      <div className="space-y-1.5">
                        {displayedHtmlSections.map(({ key, label }) => (
                          <label
                            key={key}
                            className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 rounded px-1 py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={htmlSectionFilters[key]}
                              onChange={() => toggleHtmlSectionFilter(key)}
                              className="w-4 h-4 text-main-600 border-neutral-300 rounded focus:ring-main-500"
                            />
                            <span className="flex-1 text-sm text-neutral-700 font-mono">{label}</span>
                            <span className="text-xs text-neutral-400 tabular-nums">{visibleHtmlSectionCounts[key]}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-400">No visible HTML section changes</div>
                    )}
                  </div>
                )}
              </div>
              {hiddenCount > 0 && (
                <span className="text-sm text-neutral-500">
                  {hiddenCount} hidden by filter
                </span>
              )}
              {htmlSectionChangesLoading && (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-main-500 border-t-transparent" />
                  Computing section changes…
                </div>
              )}
            </div>
          }
          showLegend={true}
          initialShowChangedOnly={true}
          autoSelectFirstChangedFile={!initialFile}
          autoExpandFolders={true}
          height="100%"
          readOnly={true}
          initialSelectedFile={initialFile}
          onPreviewFile={onPreviewFile}
        />
      </div>
    </ChangesTabErrorBoundary>
  );
};

export default PreviewChangesTab;
