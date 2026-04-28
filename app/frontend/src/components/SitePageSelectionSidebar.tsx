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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Graph } from '../../../shared_code/types/graph';
import { IPage } from '../../../shared_code/types/graph';
import { SitePageConfig } from '../../../shared_code/types/sitePageConfig';
import TraversalPathDetailsModal from './TraversalPathDetailsModal';
import SitePageLinksModal from './SitePageLinksModal';
import PageContextMenu, { ObsidianInfo } from './PageContextMenu';
import { DisabledTooltip } from './DisabledTooltip';

interface SitePageSelectionSidebarProps {
  selectedPages: Set<string>;
  graph: Graph;
  onClose: () => void;
  onSelectedPagesChange: (pages: Set<string>) => void;
  onTrackPage: (pageId: string) => void;
  onBlacklistPage: (pageId: string) => void;
  onTrackSelected: () => void;
  onBlacklistSelected: () => void;
  isEffectivelySensitive: (page: IPage) => boolean;
  onUpdatePageConfig: (pageId: string, key: keyof SitePageConfig['config'], value: number | boolean) => void;
  onDeletePageConfigKey: (pageId: string, key: keyof SitePageConfig['config']) => void;
  onPreviewPage: (pageId: string) => void;
  hasDraftChanges: boolean;
  onMarkSensitive?: (pageId: string, isSensitive: boolean) => void;
  obsidianInfo: ObsidianInfo | null;
}

const SitePageSelectionSidebar: React.FC<SitePageSelectionSidebarProps> = ({
  selectedPages,
  graph,
  onClose,
  onSelectedPagesChange,
  onTrackPage,
  onBlacklistPage,
  onTrackSelected,
  onBlacklistSelected,
  isEffectivelySensitive,
  onUpdatePageConfig,
  onDeletePageConfigKey,
  onPreviewPage,
  hasDraftChanges,
  onMarkSensitive,
  obsidianInfo,
}) => {
  const [openDropdownPageId, setOpenDropdownPageId] = useState<string | null>(null);
  const [dropdownButtonRect, setDropdownButtonRect] = useState<{ x: number; y: number } | null>(null);
  const [openDetailsPageIds, setOpenDetailsPageIds] = useState<Set<string>>(new Set());
  const [outlinksDepthInputsByPageId, setOutlinksDepthInputsByPageId] = useState<Record<string, string>>({});
  const [inlinksDepthInputsByPageId, setInlinksDepthInputsByPageId] = useState<Record<string, string>>({});
  const [outlinksDepthOverrideOpenByPageId, setOutlinksDepthOverrideOpenByPageId] = useState<Record<string, boolean>>({});
  const [inlinksDepthOverrideOpenByPageId, setInlinksDepthOverrideOpenByPageId] = useState<Record<string, boolean>>({});
  const [isTraversalDetailsModalOpen, setIsTraversalDetailsModalOpen] = useState<boolean>(false);
  const [traversalDetailsPageId, setTraversalDetailsPageId] = useState<string | null>(null);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState<boolean>(false);
  const [linksModalPageId, setLinksModalPageId] = useState<string | null>(null);

  // Path collapsing state
  const [expandedPathPageIds, setExpandedPathPageIds] = useState<Set<string>>(new Set());
  const [shouldCollapsePathByPageId, setShouldCollapsePathByPageId] = useState<Map<string, boolean>>(new Map());
  const pathMeasureRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Clear depth input caches when the graph reloads (e.g. after undo) so the
  // inputs reflect the current config values rather than stale local edits.
  useEffect(() => {
    setOutlinksDepthInputsByPageId({});
    setInlinksDepthInputsByPageId({});
  }, [graph]);

  // Auto-expand details when only the initial site page is selected
  useEffect(() => {
    if (selectedPages.size === 1) {
      const pageId = Array.from(selectedPages)[0];
      const page = graph.getPage(pageId);
      if (page && page.depth === 0) {
        setOpenDetailsPageIds(prev => {
          if (prev.has(pageId)) return prev;
          return new Set([...prev, pageId]);
        });
      }
    }
  }, [selectedPages, graph]);

  // Measure paths to determine if they should be collapsed
  useLayoutEffect(() => {
    // Get pages with paths that have 4+ components and are currently open in details
    const pagesToMeasure = Array.from(selectedPages)
      .map(id => graph.getPage(id))
      .filter((page): page is IPage =>
        page !== null &&
        page !== undefined &&
        openDetailsPageIds.has(page.id) &&
        Array.isArray(page.path) &&
        page.path.length >= 4
      );

    if (pagesToMeasure.length === 0) return;

    const measurePath = (pageId: string) => {
      const container = pathMeasureRefsMap.current.get(pageId);
      if (!container) return null;

      // Find all path items inside the measurement container
      const items = container.querySelectorAll('[data-path-item]');
      if (items.length === 0) return null;

      // Count unique rows by checking offsetTop values
      const rowTops = new Set<number>();
      items.forEach(item => {
        rowTops.add((item as HTMLElement).offsetTop);
      });

      // If more than 3 rows, should collapse
      return rowTops.size > 3;
    };

    // Initial measurement
    const newCollapseMap = new Map(shouldCollapsePathByPageId);
    pagesToMeasure.forEach(page => {
      const shouldCollapse = measurePath(page.id);
      if (shouldCollapse !== null) {
        newCollapseMap.set(page.id, shouldCollapse);
      }
    });

    // Only update if changed
    const hasChanges = pagesToMeasure.some(page => {
      const prev = shouldCollapsePathByPageId.get(page.id);
      const next = newCollapseMap.get(page.id);
      return prev !== next;
    });

    if (hasChanges) {
      setShouldCollapsePathByPageId(newCollapseMap);
    }

    // Set up ResizeObserver for dynamic updates
    const resizeObserver = new ResizeObserver(() => {
      const updatedCollapseMap = new Map(shouldCollapsePathByPageId);
      let changed = false;

      pagesToMeasure.forEach(page => {
        const shouldCollapse = measurePath(page.id);
        if (shouldCollapse !== null && updatedCollapseMap.get(page.id) !== shouldCollapse) {
          updatedCollapseMap.set(page.id, shouldCollapse);
          changed = true;
        }
      });

      if (changed) {
        setShouldCollapsePathByPageId(updatedCollapseMap);
      }
    });

    // Observe all measurement containers
    pagesToMeasure.forEach(page => {
      const container = pathMeasureRefsMap.current.get(page.id);
      if (container) {
        resizeObserver.observe(container);
      }
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedPages, graph, openDetailsPageIds, shouldCollapsePathByPageId]);

  const toggleDetailsForPage = (pageId: string) => {
    setOpenDetailsPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
        // Reset path expansion when details are closed
        setExpandedPathPageIds(prevExpanded => {
          if (prevExpanded.has(pageId)) {
            const nextExpanded = new Set(prevExpanded);
            nextExpanded.delete(pageId);
            return nextExpanded;
          }
          return prevExpanded;
        });
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const setOutlinksDepthInputForPage = (pageId: string, value: string) => {
    setOutlinksDepthInputsByPageId(prev => ({ ...prev, [pageId]: value }));
  };

  const setInlinksDepthInputForPage = (pageId: string, value: string) => {
    setInlinksDepthInputsByPageId(prev => ({ ...prev, [pageId]: value }));
  };

  const handleSetOutlinksDepthForPage = (pageId: string) => {
    const raw = outlinksDepthInputsByPageId[pageId] ?? '';
    if (raw === '') return;
    const depth = parseInt(raw, 10);
    if (!isNaN(depth) && depth >= 0) {
      onUpdatePageConfig(pageId, 'outlinks_depth', depth);
      setOutlinksDepthInputForPage(pageId, String(depth));
      setOutlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [pageId]: false }));
    }
  };

  const handleClearOutlinksDepthForPage = (pageId: string) => {
    onDeletePageConfigKey(pageId, 'outlinks_depth');
    setOutlinksDepthInputForPage(pageId, '');
    setOutlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [pageId]: false }));
  };

  const handleSetInlinksDepthForPage = (pageId: string) => {
    const raw = inlinksDepthInputsByPageId[pageId] ?? '';
    if (raw === '') return;
    const depth = parseInt(raw, 10);
    if (!isNaN(depth) && depth >= 0) {
      onUpdatePageConfig(pageId, 'inlinks_depth', depth);
      setInlinksDepthInputForPage(pageId, String(depth));
      setInlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [pageId]: false }));
    }
  };

  const handleClearInlinksDepthForPage = (pageId: string) => {
    onDeletePageConfigKey(pageId, 'inlinks_depth');
    setInlinksDepthInputForPage(pageId, '');
    setInlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [pageId]: false }));
  };

  return (
    <>
      <div className="h-full w-full flex flex-col">
      {/* Fixed Header */}
      <div className="flex-none bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center">
        <h3 className="font-bold text-neutral-700">Selected</h3>
        <button
          className="text-neutral-500 hover:text-neutral-700 focus:outline-none flex items-center gap-1"
          onClick={onClose}
          title="Collapse panel"
        >
          <span className="text-sm">Collapse</span>
          <span className="text-lg">&raquo;</span>
        </button>
      </div>

      {/* Content Section */}
      <div className="flex-none p-4 space-y-3 border-b">
        {selectedPages.size === 0 ? (
          <p className="text-sm text-neutral-500 italic">Please select a page.</p>
        ) : (
          <div className="space-y-2">
            {selectedPages.size > 2 && (
              <div className="text-sm text-neutral-600">
                {selectedPages.size} selected
              </div>
            )}
            {selectedPages.size > 1 && (
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <div className="flex gap-2">
                  {(() => {
                    const hasSensitiveOrFrontier = Array.from(selectedPages).some(id => {
                      const page = graph.getPage(id);
                      return page && (isEffectivelySensitive(page) || page.isFrontierPage);
                    });
                    const allAlreadyTracked = Array.from(selectedPages).every(id => {
                      const page = graph.getPage(id);
                      return page && page.tracked;
                    });
                    const isDisabled = hasSensitiveOrFrontier || allAlreadyTracked;
                    return (
                      <DisabledTooltip disabled={allAlreadyTracked} tooltip="All selected pages are already tracked" className="flex-1">
                        <button
                          onClick={onTrackSelected}
                          disabled={isDisabled}
                          className={`w-full px-4 py-2 text-sm rounded ${
                            isDisabled
                              ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                              : 'bg-success-100 text-success-700 hover:bg-success-200'
                          }`}
                        >
                          Track All
                        </button>
                      </DisabledTooltip>
                    );
                  })()}
                  <button
                    onClick={onBlacklistSelected}
                    disabled={Array.from(selectedPages).some(id => {
                      const page = graph.getPage(id);
                      return page && page.isFrontierPage;
                    })}
                    className={`flex-1 px-4 py-2 text-sm rounded ${
                      Array.from(selectedPages).some(id => {
                        const page = graph.getPage(id);
                        return page && page.isFrontierPage;
                      })
                        ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                        : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                    }`}
                  >
                    Blacklist All
                  </button>
                </div>
                {Array.from(selectedPages)
                  .map(id => graph.getPage(id))
                  .some(page => page && isEffectivelySensitive(page)) && (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 italic">
                      Cannot bulk track all pages because some selected pages are marked as sensitive.
                    </p>
                    <button
                      onClick={() => {
                        const nonSensitivePages = Array.from(selectedPages).filter(
                          id => {
                            const page = graph.getPage(id);
                            return !(page && isEffectivelySensitive(page));
                          }
                        );
                        onSelectedPagesChange(new Set(nonSensitivePages));
                      }}
                      className="text-sm text-main-600 hover:text-main-800 hover:underline"
                    >
                      Deselect sensitive pages
                    </button>
                  </div>
                )}
                {Array.from(selectedPages)
                  .map(id => graph.getPage(id))
                  .some(page => page && page.isFrontierPage) && (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 italic">
                      Cannot track/blacklist frontier pages (they are outside the working area).
                    </p>
                    <button
                      onClick={() => {
                        const nonFrontierPages = Array.from(selectedPages).filter(
                          id => {
                            const page = graph.getPage(id);
                            return !(page && page.isFrontierPage);
                          }
                        );
                        onSelectedPagesChange(new Set(nonFrontierPages));
                      }}
                      className="text-sm text-main-600 hover:text-main-800 hover:underline"
                    >
                      Deselect frontier pages
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Pages List Container */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="divide-y divide-neutral-200">
          {Array.from(selectedPages)
            .map((id, originalIndex) => ({ id, originalIndex, page: graph.getPage(id) }))
            .filter((x): x is { id: string; originalIndex: number; page: IPage } => Boolean(x.page))
            .sort((a, b) => {
              // Always order untracked + (effectively) sensitive pages to the top.
              // For all other pages, keep the existing selection order (newest-first insertion).
              const aPriority = !a.page.tracked && isEffectivelySensitive(a.page) ? 0 : 1;
              const bPriority = !b.page.tracked && isEffectivelySensitive(b.page) ? 0 : 1;
              if (aPriority !== bPriority) return aPriority - bPriority;
              return a.originalIndex - b.originalIndex;
            })
            .map(({ page }) => (
              <div key={page!.id} className="p-4 hover:bg-neutral-50" data-testid={`selected-page-${page!.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate flex-1 mr-2">{page!.data?.title || page!.label}</span>
                  <div className="flex items-center gap-1 flex-none">
                    {/* More options dropdown */}
                    <button
                      onClick={(e) => {
                        if (openDropdownPageId === page!.id) {
                          setOpenDropdownPageId(null);
                          setDropdownButtonRect(null);
                        } else {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setOpenDropdownPageId(page!.id);
                          setDropdownButtonRect({ x: rect.right - 192, y: rect.bottom + 4 });
                        }
                      }}
                      className="px-2 py-1 text-xs rounded text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      title="More options"
                    >
                      ...
                    </button>
                    {openDropdownPageId === page!.id && dropdownButtonRect && (
                      <PageContextMenu
                        page={page!}
                        graph={graph}
                        position={dropdownButtonRect}
                        onClose={() => { setOpenDropdownPageId(null); setDropdownButtonRect(null); }}
                        onTrackPage={onTrackPage}
                        onBlacklistPage={onBlacklistPage}
                        onPreviewPage={onPreviewPage}
                        hasDraftChanges={hasDraftChanges}
                        onSelectedPagesChange={onSelectedPagesChange}
                        onMarkSensitive={onMarkSensitive}
                        obsidianInfo={obsidianInfo}
                      />
                    )}
                    <button
                      onClick={() => {
                        onSelectedPagesChange(new Set(
                          Array.from(selectedPages).filter(id => id !== page!.id)
                        ));
                      }}
                      className="p-1 rounded hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      title="Deselect"
                    >
                      <svg
                        className="w-4 h-4 text-neutral-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    page!.tracked
                      ? 'bg-success-100 text-success-800'
                      : 'bg-neutral-100 text-neutral-800'
                  }`}>
                    {page!.tracked ? 'Tracked' : 'Not Tracked'}
                  </span>
                  {page!.blacklisted && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-danger-100 text-danger-800">
                      Blacklisted
                    </span>
                  )}
                  {isEffectivelySensitive(page!) && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-danger-100 text-danger-800">
                      Sensitive
                    </span>
                  )}
                  {page!.isFrontierPage && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-pink-100 text-pink-800">
                      Frontier
                    </span>
                  )}
                  {page!.isFrontierImageExtension && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-violet-100 text-violet-800" title="This image was included because it was linked from a frontier-edge page and we try not to break images">
                      Frontier Image
                    </span>
                  )}
                </div>
                {/* For untracked pages, show Track + Blacklist as the primary quick-actions */}
                {!page!.tracked && (
                  <div className="mt-2 flex gap-2">
                    <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Cannot track frontier pages" className="flex-1">
                      <button
                        onClick={() => onTrackPage(page!.id)}
                        disabled={page!.isFrontierPage}
                        className={`w-full px-2 py-1 text-xs rounded ${
                          page!.isFrontierPage
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-success-100 text-success-700 hover:bg-success-200'
                        }`}
                      >
                        Track
                      </button>
                    </DisabledTooltip>
                    {!page!.blacklisted && (
                      <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Cannot blacklist frontier pages" align="right" className="flex-1">
                        <button
                          onClick={() => onBlacklistPage(page!.id)}
                          disabled={page!.isFrontierPage}
                          className={`w-full px-2 py-1 text-xs rounded ${
                            page!.isFrontierPage
                              ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                              : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                          }`}
                        >
                          Blacklist
                        </button>
                      </DisabledTooltip>
                    )}
                  </div>
                )}

                {/* Collapsed details: path + depth overrides */}
                <div className="mt-2">
                  <button
                    onClick={() => toggleDetailsForPage(page!.id)}
                    className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
                    title="Toggle details"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform duration-200 ${openDetailsPageIds.has(page!.id) ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span>Details</span>
                  </button>

                  {openDetailsPageIds.has(page!.id) && (
                    <div className="mt-2 p-2 bg-neutral-50 border border-neutral-200 rounded space-y-2">
                      {/* Path - only show for non-initial pages */}
                      {page!.depth !== 0 && Array.isArray(page!.path) && page!.path.length > 0 && (
                        <div style={{ position: 'relative' }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-neutral-700">Path</div>
                            <button
                              onClick={() => {
                                setTraversalDetailsPageId(page!.id);
                                setIsTraversalDetailsModalOpen(true);
                              }}
                              className="p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                              title="Show detailed traversal information"
                              type="button"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </div>
                          {/* Hidden measurement container for path wrapping detection */}
                          {page!.path.length >= 4 && (
                            <div
                              ref={el => pathMeasureRefsMap.current.set(page!.id, el)}
                              className="flex flex-wrap items-center gap-1"
                              style={{ visibility: 'hidden', position: 'absolute', left: 0, right: 0, pointerEvents: 'none' }}
                              aria-hidden="true"
                            >
                              {page!.path.map((pathPageId, idx) => {
                                const pathPage = graph.getPage(pathPageId);
                                const label = pathPage?.title || pathPageId.split('/').pop() || 'Unknown';
                                const isLast = idx === page!.path!.length - 1;
                                return (
                                  <div key={`${page!.id}-measure-${pathPageId}-${idx}`} className="flex items-center" data-path-item>
                                    <span className="px-2 py-0.5 text-xs rounded border border-neutral-300 bg-white text-neutral-700">
                                      {label}
                                    </span>
                                    {!isLast && <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Visible path with collapse logic */}
                          <div className="flex flex-wrap items-center gap-1">
                            {(() => {
                              const pathLength = page!.path.length;
                              const shouldCollapse = shouldCollapsePathByPageId.get(page!.id) ?? false;
                              const isExpanded = expandedPathPageIds.has(page!.id);
                              const showCollapsed = pathLength >= 4 && shouldCollapse && !isExpanded;

                              if (showCollapsed) {
                                // Collapsed view: [first] -> [n more] -> [last]
                                const firstPageId = page!.path[0];
                                const lastPageId = page!.path[pathLength - 1];
                                const firstPage = graph.getPage(firstPageId);
                                const lastPage = graph.getPage(lastPageId);
                                const firstLabel = firstPage?.title || firstPageId.split('/').pop() || 'Unknown';
                                const lastLabel = lastPage?.title || lastPageId.split('/').pop() || 'Unknown';
                                const middleCount = pathLength - 2;

                                return (
                                  <>
                                    <div className="flex items-center">
                                      <button
                                        onClick={() => onSelectedPagesChange(new Set([...selectedPages, firstPageId]))}
                                        className="px-2 py-0.5 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 cursor-pointer"
                                        title={`Select "${firstLabel}"`}
                                      >
                                        {firstLabel}
                                      </button>
                                      <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>
                                    </div>
                                    <button
                                      onClick={() => setExpandedPathPageIds(prev => new Set([...prev, page!.id]))}
                                      className="px-2 py-0.5 text-xs rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                                      title="Click to expand full path"
                                    >
                                      {middleCount} more
                                    </button>
                                    <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>
                                    <div className="flex items-center">
                                      <button
                                        onClick={() => onSelectedPagesChange(new Set([...selectedPages, lastPageId]))}
                                        className="px-2 py-0.5 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 cursor-pointer"
                                        title={`Select "${lastLabel}"`}
                                      >
                                        {lastLabel}
                                      </button>
                                    </div>
                                  </>
                                );
                              } else {
                                // Full path view
                                return page!.path.map((pathPageId, idx) => {
                                  const pathPage = graph.getPage(pathPageId);
                                  const label = pathPage?.title || pathPageId.split('/').pop() || 'Unknown';
                                  const isLast = idx === page!.path!.length - 1;
                                  return (
                                    <div key={`${page!.id}-path-${pathPageId}-${idx}`} className="flex items-center">
                                      <button
                                        onClick={() => onSelectedPagesChange(new Set([...selectedPages, pathPageId]))}
                                        className="px-2 py-0.5 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 cursor-pointer"
                                        title={`Select "${label}"`}
                                      >
                                        {label}
                                      </button>
                                      {!isLast && <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>}
                                    </div>
                                  );
                                });
                              }
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Outlink Depth */}
                      <div>
                        {page!.depth === 0 ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Outlink Depth</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.config?.outlinks_depth === undefined ? '(not set)' : page!.conf.config.outlinks_depth}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  outlinksDepthInputsByPageId[page!.id] ??
                                  (page!.conf?.config?.outlinks_depth === undefined ? '' : String(page!.conf.config.outlinks_depth))
                                }
                                onChange={(e) => setOutlinksDepthInputForPage(page!.id, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetOutlinksDepthForPage(page!.id)}
                                disabled={(outlinksDepthInputsByPageId[page!.id] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                            </div>
                          </>
                        ) : outlinksDepthOverrideOpenByPageId[page!.id] ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Outlink Depth Override</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.config?.outlinks_depth !== undefined ? (
                                  <span className="flex items-center gap-1">
                                    {page!.traversal_details?.outlinks_depth_inherited !== undefined && (
                                      <>
                                        <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.outlinks_depth_inherited}</span>
                                        <span className="text-amber-500">→</span>
                                      </>
                                    )}
                                    <span className="font-semibold text-neutral-700">{page!.conf.config.outlinks_depth}</span>
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">inherited: {page!.remaining_depth}</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  outlinksDepthInputsByPageId[page!.id] ??
                                  (page!.conf?.config?.outlinks_depth === undefined ? '' : String(page!.conf.config.outlinks_depth))
                                }
                                onChange={(e) => setOutlinksDepthInputForPage(page!.id, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetOutlinksDepthForPage(page!.id)}
                                disabled={(outlinksDepthInputsByPageId[page!.id] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                              <button
                                onClick={() => {
                                  setOutlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: false }));
                                  setOutlinksDepthInputForPage(page!.id, '');
                                }}
                                className="px-2 py-1 text-xs rounded bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : page!.conf?.config?.outlinks_depth !== undefined ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-neutral-700">Outlink Depth</span>
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600">override</span>
                              <span className="flex items-center gap-1 text-xs">
                                {page!.traversal_details?.outlinks_depth_inherited !== undefined && (
                                  <>
                                    <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.outlinks_depth_inherited}</span>
                                    <span className="text-amber-500">→</span>
                                  </>
                                )}
                                <span className="font-semibold text-neutral-700">{page!.conf.config.outlinks_depth}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Edit outlink depth override"
                                  onClick={() => setOutlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: true }))}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Remove outlink depth override"
                                  onClick={() => handleClearOutlinksDepthForPage(page!.id)}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-danger-100 hover:text-danger-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5h-.32l-.95 10.22A1.75 1.75 0 0110.24 16H5.76a1.75 1.75 0 01-1.74-1.28L3.07 4.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.58 4.5l.92 9.92a.25.25 0 00.25.08h4.5a.25.25 0 00.25-.08l.92-9.92H4.58z" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-neutral-700">Outlink Depth</div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-neutral-500">{page!.remaining_depth}</span>
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Add outlink depth override"
                                  onClick={() => setOutlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: true }))}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Inlink Depth */}
                      <div>
                        {page!.depth === 0 ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Inlink Depth</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.config?.inlinks_depth === undefined ? '(not set)' : page!.conf.config.inlinks_depth}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  inlinksDepthInputsByPageId[page!.id] ??
                                  (page!.conf?.config?.inlinks_depth === undefined ? '' : String(page!.conf.config.inlinks_depth))
                                }
                                onChange={(e) => setInlinksDepthInputForPage(page!.id, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetInlinksDepthForPage(page!.id)}
                                disabled={(inlinksDepthInputsByPageId[page!.id] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                            </div>
                          </>
                        ) : inlinksDepthOverrideOpenByPageId[page!.id] ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Inlink Depth Override</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.config?.inlinks_depth !== undefined ? (
                                  <span className="flex items-center gap-1">
                                    {page!.traversal_details?.inlinks_depth_inherited !== undefined && (
                                      <>
                                        <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.inlinks_depth_inherited}</span>
                                        <span className="text-amber-500">→</span>
                                      </>
                                    )}
                                    <span className="font-semibold text-neutral-700">{page!.conf.config.inlinks_depth}</span>
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">inherited: {page!.remaining_inlinks_depth ?? 0}</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  inlinksDepthInputsByPageId[page!.id] ??
                                  (page!.conf?.config?.inlinks_depth === undefined ? '' : String(page!.conf.config.inlinks_depth))
                                }
                                onChange={(e) => setInlinksDepthInputForPage(page!.id, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetInlinksDepthForPage(page!.id)}
                                disabled={(inlinksDepthInputsByPageId[page!.id] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                              <button
                                onClick={() => {
                                  setInlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: false }));
                                  setInlinksDepthInputForPage(page!.id, '');
                                }}
                                className="px-2 py-1 text-xs rounded bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : page!.conf?.config?.inlinks_depth !== undefined ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-neutral-700">Inlink Depth</span>
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600">override</span>
                              <span className="flex items-center gap-1 text-xs">
                                {page!.traversal_details?.inlinks_depth_inherited !== undefined && (
                                  <>
                                    <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.inlinks_depth_inherited}</span>
                                    <span className="text-amber-500">→</span>
                                  </>
                                )}
                                <span className="font-semibold text-neutral-700">{page!.conf.config.inlinks_depth}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Edit inlink depth override"
                                  onClick={() => setInlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: true }))}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Remove inlink depth override"
                                  onClick={() => handleClearInlinksDepthForPage(page!.id)}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-danger-100 hover:text-danger-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5h-.32l-.95 10.22A1.75 1.75 0 0110.24 16H5.76a1.75 1.75 0 01-1.74-1.28L3.07 4.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.58 4.5l.92 9.92a.25.25 0 00.25.08h4.5a.25.25 0 00.25-.08l.92-9.92H4.58z" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-neutral-700">Inlink Depth</div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-neutral-500">{page!.remaining_inlinks_depth ?? 0}</span>
                              <DisabledTooltip disabled={page!.isFrontierPage} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  onClick={() => setInlinksDepthOverrideOpenByPageId(prev => ({ ...prev, [page!.id]: true }))}
                                  disabled={page!.isFrontierPage}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierPage ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Source Graph Link Counts (unique pages, not total edges) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold text-neutral-700">Links</div>
                          <button
                            onClick={() => {
                              setLinksModalPageId(page!.id);
                              setIsLinksModalOpen(true);
                            }}
                            className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                            title="Show all inlinks and outlinks for this page"
                          >
                            Show Links
                          </button>
                        </div>
                        {(() => {
                          const allOutlinks = graph.getAllOutlinkTargets(page!.id);
                          const allInlinks = graph.getAllInlinkSources(page!.id);
                          const outlinksInGraph = allOutlinks.filter(id => graph.getPage(id)).length;
                          const inlinksInGraph = allInlinks.filter(id => graph.getPage(id)).length;
                          const outlinksNotInGraph = allOutlinks.length - outlinksInGraph;
                          const inlinksNotInGraph = allInlinks.length - inlinksInGraph;
                          return (
                            <div className="text-xs space-y-1">
                              <div>
                                <span className="text-neutral-500">Outlinks:</span>{' '}
                                <span className="font-medium">{allOutlinks.length}</span>
                                {outlinksNotInGraph > 0 && (
                                  <span className="text-neutral-400 ml-1">
                                    ({outlinksNotInGraph} not in graph)
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-neutral-500">Inlinks:</span>{' '}
                                <span className="font-medium">{allInlinks.length}</span>
                                {inlinksNotInGraph > 0 && (
                                  <span className="text-neutral-400 ml-1">
                                    ({inlinksNotInGraph} not in graph)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
        </div>
      </div>

      {/* Traversal Path Details Modal */}
      {isTraversalDetailsModalOpen && traversalDetailsPageId && graph.getPage(traversalDetailsPageId) && (
        <TraversalPathDetailsModal
          isOpen={isTraversalDetailsModalOpen}
          onClose={() => setIsTraversalDetailsModalOpen(false)}
          selectedPage={graph.getPage(traversalDetailsPageId)!}
          graph={graph}
        />
      )}

      {/* Site Page Links Modal */}
      {isLinksModalOpen && linksModalPageId && (
        <SitePageLinksModal
          isOpen={isLinksModalOpen}
          onClose={() => setIsLinksModalOpen(false)}
          initialPageId={linksModalPageId}
          graph={graph}
          onSelectPage={(pageId) => {
            const newSelection = new Set(selectedPages);
            newSelection.add(pageId);
            onSelectedPagesChange(newSelection);
          }}
          onDeselectPage={(pageId) => {
            const newSelection = new Set(selectedPages);
            newSelection.delete(pageId);
            onSelectedPagesChange(newSelection);
          }}
          selectedPages={selectedPages}
          isEffectivelySensitive={isEffectivelySensitive}
        />
      )}
    </>
  );
};

export default SitePageSelectionSidebar;
