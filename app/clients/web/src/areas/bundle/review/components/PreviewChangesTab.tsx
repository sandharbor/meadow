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
import { ConfigFileExplorer, ConfigFileExplorerApi, fileNodeKey } from '../../../../../shared_components/ConfigFileExplorer';
import type { FileNode, FileTreeResponse } from '../../../../../shared_components/ConfigFileExplorer';
import { PathChange } from '../../../../shared/components/PathChange';
import { ToolbarIconButton } from '../../../../../shared_components/ToolbarIconButton';
import { apiRequest } from '../../../../shared/utils/apiClient';
import { logger } from '../../../../shared/utils/logger';

type HtmlSectionKey = 'head' | 'aside' | 'header' | 'main' | 'footer';
type HtmlSectionFilterKey = HtmlSectionKey | 'other';
type HtmlSectionChanges = Record<HtmlSectionFilterKey, boolean>;
type HtmlSectionFilters = Record<HtmlSectionFilterKey, boolean>;
type ChangeTypeKey = 'added' | 'modified' | 'moved' | 'deleted';
type ChangeTypeFilters = Record<ChangeTypeKey, boolean>;

type RecordState =
  | { kind: 'valid' | 'legacy' }
  | { kind: 'unsupported' | 'corrupt'; diagnostic: string };

/** The comparison Review shows, as summarized by the Runtime with the changed-files tree. */
export interface GeneratedComparisonSummary {
  baseline: 'empty' | 'saved-current' | 'saved-predecessor' | 'selected';
  left: { kind: 'empty' | 'saved' | 'working'; versionId: string | null; record: RecordState };
  right: { kind: 'empty' | 'saved' | 'working'; versionId: string | null; record: RecordState };
  identityPairing: boolean;
  counts: { total: number; added: number; deleted: number; modified: number; moved: number };
}

/**
 * Whether a changed node passes the change-type filters. A moved and modified
 * file matches either filter; HTML section filters apply only to its content
 * changes, so a pure move is never hidden by them.
 */
export const passesChangeFilters = (
  node: FileNode,
  changeTypes: ChangeTypeFilters,
  sectionsPass: boolean,
): boolean => {
  const comparison = node.comparison;
  if (comparison) {
    if (comparison.kind === 'added') return changeTypes.added && sectionsPass;
    if (comparison.kind === 'deleted') return changeTypes.deleted && sectionsPass;
    return (comparison.moved && changeTypes.moved) || (comparison.modified && changeTypes.modified && sectionsPass);
  }
  if (!node.gitStatus || node.gitStatus === 'has-changes') return true;
  if (node.gitStatus === 'new' || node.gitStatus === 'staged-new') return changeTypes.added && sectionsPass;
  if (node.gitStatus === 'modified' || node.gitStatus === 'staged-modified') return changeTypes.modified && sectionsPass;
  if (node.gitStatus === 'deleted') return changeTypes.deleted && sectionsPass;
  return sectionsPass;
};

function baselineDescription(summary: GeneratedComparisonSummary, generatedVersionLabels: Record<string, string>): string {
  if (summary.baseline === 'empty') return 'Compared with an empty site: this is the first generation.';
  if (summary.baseline === 'saved-predecessor') {
    const versionLabel = summary.left.versionId ? generatedVersionLabels[summary.left.versionId] : undefined;
    return `Compared with the saved generation of the previous version${versionLabel ? ` (${versionLabel})` : ''}. This new version is unsaved until you save it.`;
  }
  return 'Compared with the last saved generation of this version.';
}

function identityNotice(summary: GeneratedComparisonSummary): string | null {
  const { left, right } = summary;
  if (right.record.kind === 'corrupt') {
    return `This generation's identity records are damaged (${right.record.diagnostic}). Files are compared by path only, so moves are not shown. Generate again before saving.`;
  }
  if (right.record.kind === 'unsupported') return `${right.record.diagnostic} Files are compared by path only.`;
  if (left.record.kind === 'corrupt') {
    return `The comparison baseline's identity records are damaged (${left.record.diagnostic}). Files are compared by path only, so moves are not shown.`;
  }
  if (left.record.kind === 'unsupported') return `${left.record.diagnostic} Files are compared by path only.`;
  if (left.record.kind === 'legacy' || right.record.kind === 'legacy') {
    return 'The baseline was generated before Meadow recorded file identity, so moved files appear as additions and deletions.';
  }
  return null;
}

export const shouldShowHtmlForSectionFilters = (
  changes: HtmlSectionChanges,
  filters: HtmlSectionFilters,
): boolean => {
  return (
    (filters.head && changes.head) ||
    (filters.aside && changes.aside) ||
    (filters.header && changes.header) ||
    (filters.main && changes.main) ||
    (filters.footer && changes.footer) ||
    (filters.other && changes.other)
  );
};

interface PreviewChangesTabProps {
  slug: string;
  isActive: boolean; // true when this tab is visible
  isRegeneratingPreview: boolean;
  publishSuccess: boolean;
  baseApi: ConfigFileExplorerApi;
  generatedVersionLabels: Record<string, string>;
  initialFile?: string;
  onPreviewFile?: (path: string) => void;
  /** Increment to force tree refresh (e.g. after save) */
  refreshKey: number;
  contentRefreshKey?: number;
  onSelectedFileChange?: (path: string) => void;
}

export const shouldAutoExpandPreviewFolder = (node: FileNode): boolean => {
  if (node.name === '_mw_assets' || node.name === '_mw_gen') return false;

  const pathSegments = node.path.replace(/\\/g, '/').split('/').filter(Boolean);
  return pathSegments.slice(-4).join('/') !== '_mw_assets/cust/search/index';
};

export const shouldPreferPreviewChangeFile = (node: FileNode): boolean => {
  const pathSegments = node.path.replace(/\\/g, '/').split('/').filter(Boolean);
  return !pathSegments.includes('_mw_assets') && !pathSegments.includes('_mw_gen');
};

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
  generatedVersionLabels,
  initialFile,
  onPreviewFile,
  refreshKey,
  contentRefreshKey,
  onSelectedFileChange,
}) => {
  // HTML section filtering state
  const [htmlSectionFilters, setHtmlSectionFilters] = useState<HtmlSectionFilters>({
    head: true,
    aside: true,
    header: true,
    main: true,
    footer: true,
    other: true,
  });
  const [htmlSectionChangesMap, setHtmlSectionChangesMap] = useState<Record<string, HtmlSectionChanges>>({});
  const [htmlSectionChangesLoading, setHtmlSectionChangesLoading] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [htmlSectionChangesEpoch, setHtmlSectionChangesEpoch] = useState(0);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Change type filtering state
  const [changeTypeFilters, setChangeTypeFilters] = useState<ChangeTypeFilters>({
    added: true,
    modified: true,
    moved: true,
    deleted: true,
  });
  const [changeTypeCounts, setChangeTypeCounts] = useState<Record<ChangeTypeKey, number>>({
    added: 0,
    modified: 0,
    moved: 0,
    deleted: 0,
  });
  const [comparisonSummary, setComparisonSummary] = useState<GeneratedComparisonSummary | null>(null);

  // Visible HTML section counts (reflects only files passing change type filter)
  const [visibleHtmlSectionCounts, setVisibleHtmlSectionCounts] = useState<Record<HtmlSectionFilterKey, number>>({
    head: 0, aside: 0, header: 0, main: 0, footer: 0, other: 0,
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
    apiRequest(`bundles/${slug}/review/preview-files/html-section-changes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch HTML section changes (${res.status})`);
        return res.json() as Promise<{ files: Array<{ entryId?: string; path: string; sections: HtmlSectionChanges }> }>;
      })
      .then((data) => {
        const map: Record<string, HtmlSectionChanges> = {};
        for (const f of data.files || []) {
          const key = f?.entryId ?? f?.path;
          if (key && f.sections) {
            map[key] = f.sections;
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

  const toggleHtmlSectionFilter = useCallback((key: HtmlSectionFilterKey) => {
    setHtmlSectionFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleChangeTypeFilter = useCallback((key: ChangeTypeKey) => {
    setChangeTypeFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const sectionFilterKey = useMemo(() => {
    return [
      htmlSectionFilters.head ? '1' : '0',
      htmlSectionFilters.aside ? '1' : '0',
      htmlSectionFilters.header ? '1' : '0',
      htmlSectionFilters.main ? '1' : '0',
      htmlSectionFilters.footer ? '1' : '0',
      htmlSectionFilters.other ? '1' : '0',
    ].join('');
  }, [htmlSectionFilters]);

  const changeTypeFilterKey = useMemo(() => {
    return [
      changeTypeFilters.added ? '1' : '0',
      changeTypeFilters.modified ? '1' : '0',
      changeTypeFilters.moved ? '1' : '0',
      changeTypeFilters.deleted ? '1' : '0',
    ].join('');
  }, [changeTypeFilters]);

  const displayedHtmlSections = useMemo(() => {
    const sections: Array<{ key: HtmlSectionFilterKey; label: string }> = [
      { key: 'head', label: '<head>' },
      { key: 'aside', label: '<aside>' },
      { key: 'header', label: '<header>' },
      { key: 'main', label: '<main>' },
      { key: 'footer', label: '<footer>' },
      { key: 'other', label: 'Other' },
    ];
    return sections.filter(({ key }) => visibleHtmlSectionCounts[key] > 0);
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

  const changedFileNodes = useCallback((nodes: FileNode[]): FileNode[] => nodes.flatMap(node => [
    ...(node.type === 'file' && node.gitStatus && node.gitStatus !== 'has-changes' ? [node] : []),
    ...(node.children ? changedFileNodes(node.children) : []),
  ]), []);

  const countFilesByChangeType = useCallback((nodes: FileNode[]): Record<ChangeTypeKey, number> => {
    const counts: Record<ChangeTypeKey, number> = { added: 0, modified: 0, moved: 0, deleted: 0 };
    for (const node of changedFileNodes(nodes)) {
      const comparison = node.comparison;
      if (comparison) {
        if (comparison.kind === 'added') counts.added++;
        else if (comparison.kind === 'deleted') counts.deleted++;
        if (comparison.moved) counts.moved++;
        if (comparison.modified) counts.modified++;
      } else if (node.gitStatus === 'new' || node.gitStatus === 'staged-new') counts.added++;
      else if (node.gitStatus === 'modified' || node.gitStatus === 'staged-modified') counts.modified++;
      else if (node.gitStatus === 'deleted') counts.deleted++;
    }
    return counts;
  }, [changedFileNodes]);

  const sectionsPassFor = useCallback((node: FileNode): boolean => {
    if (!node.name.toLowerCase().endsWith('.html')) return true;
    const changes = htmlSectionChangesMap[fileNodeKey(node)];
    return !changes || shouldShowHtmlForSectionFilters(changes, htmlSectionFilters);
  }, [htmlSectionChangesMap, htmlSectionFilters]);

  // Filtered API adapter
  const filteredApi: ConfigFileExplorerApi = useMemo(() => ({
    ...baseApi,
    fetchTree: async (options) => {
      const data = (await baseApi.fetchTree(options)) as FileTreeResponse & { comparison?: GeneratedComparisonSummary | null };
      setComparisonSummary(data.comparison ?? null);

      if (!options?.changedOnly) {
        setHiddenCount(0);
        return data;
      }

      const rawTree = data.tree || [];

      // 1. Category counts overlap: a moved and modified file counts in both.
      setChangeTypeCounts(countFilesByChangeType(rawTree));

      // 2. Visible HTML section counts reflect files passing the change-type filter.
      const afterChangeTypeFilter = filterTree(rawTree, node => passesChangeFilters(node, changeTypeFilters, true));
      const visCounts: Record<HtmlSectionFilterKey, number> = {
        head: 0,
        aside: 0,
        header: 0,
        main: 0,
        footer: 0,
        other: 0,
      };
      for (const node of changedFileNodes(afterChangeTypeFilter)) {
        const changes = htmlSectionChangesMap[fileNodeKey(node)];
        if (!changes) continue;
        if (changes.head) visCounts.head++;
        if (changes.aside) visCounts.aside++;
        if (changes.header) visCounts.header++;
        if (changes.main) visCounts.main++;
        if (changes.footer) visCounts.footer++;
        if (changes.other) visCounts.other++;
      }
      setVisibleHtmlSectionCounts(visCounts);

      // 3. Apply both filters. Section filters constrain content changes only.
      const finalTree = filterTree(rawTree, node => passesChangeFilters(node, changeTypeFilters, sectionsPassFor(node)));

      // 4. Each logical change counts once toward the total.
      const totalChanged = changedFileNodes(rawTree).length;
      const visibleChanged = changedFileNodes(finalTree).length;
      setHiddenCount(Math.max(0, totalChanged - visibleChanged));

      return { ...data, tree: finalTree };
    },
  }), [baseApi, htmlSectionChangesMap, changeTypeFilters, filterTree, countFilesByChangeType, changedFileNodes, sectionsPassFor]);

  const renderSelectedFileDetails = useCallback((node: FileNode) => {
    const comparison = node.comparison;
    if (!comparison?.moved || !comparison.before || !comparison.after) return null;
    return (
      <div className="text-xs text-neutral-600" data-testid="generated-file-move">
        <PathChange
          before={comparison.before.path}
          after={comparison.after.path}
          rootLabel="Site root"
          testIdPrefix="generated-path"
        />
      </div>
    );
  }, []);

  const notice = comparisonSummary ? identityNotice(comparisonSummary) : null;

  return (
    <ChangesTabErrorBoundary>
      <div className="flex h-full flex-col">
        {comparisonSummary && (
          <div className="border-b border-neutral-200 px-2 py-1.5 text-xs text-neutral-600" data-testid="changes-comparison-baseline">
            <span>{baselineDescription(comparisonSummary, generatedVersionLabels)}</span>
            {comparisonSummary.counts.total === 0 && <span> No generated-file differences.</span>}
            {notice && (
              <div role="status" className="mt-1 rounded border border-warning-200 bg-warning-50 px-2 py-1 text-warning-800" data-testid="changes-identity-notice">
                {notice}
              </div>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
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
                        { key: 'moved' as ChangeTypeKey, label: 'Moved', badge: '→', badgeClass: 'text-info-500' },
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
              {comparisonSummary && comparisonSummary.counts.total > 0 && (
                <span className="text-sm text-neutral-500" data-testid="changes-total">
                  {comparisonSummary.counts.total} changed file{comparisonSummary.counts.total === 1 ? '' : 's'}
                </span>
              )}
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
          shouldPreferAutoSelectedFile={shouldPreferPreviewChangeFile}
          autoExpandFolders={true}
          shouldAutoExpandFolder={shouldAutoExpandPreviewFolder}
          height="100%"
          readOnly={true}
          initialSelectedFile={initialFile}
          contentRefreshKey={contentRefreshKey}
          onFileSelect={onSelectedFileChange}
          onPreviewFile={onPreviewFile}
          renderSelectedFileDetails={renderSelectedFileDetails}
        />
        </div>
      </div>
    </ChangesTabErrorBoundary>
  );
};

export default PreviewChangesTab;
