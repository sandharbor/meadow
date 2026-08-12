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
import { Graph } from '../../../../../../shared_code/types/graph';
import type { ISiteNode } from '../../../../../../shared_code/types/ISiteNode';
import TraversalPathDetailsModal from './TraversalPathDetailsModal';
import SiteNodeLinksModal from './SiteNodeLinksModal';
import SiteNodeContextMenu, { ObsidianInfo } from './SiteNodeContextMenu';
import { DisabledTooltip } from '../../../../shared/components/DisabledTooltip';

interface SiteNodeSelectionSidebarProps {
  selectedNodeKeys: Set<string>;
  graph: Graph;
  onClose: () => void;
  onSelectedNodeKeysChange: (pages: Set<string>) => void;
  onTrackPage: (siteNodeKey: string) => void;
  onBlacklistPage: (siteNodeKey: string) => void;
  onTrackSelected: () => void;
  onBlacklistSelected: () => void;
  isEffectivelySensitive: (page: ISiteNode) => boolean;
  onUpdatePageConfig: (siteNodeKey: string, key: 'outlinksDepth' | 'inlinksDepth', value: number) => void;
  onDeletePageConfigKey: (siteNodeKey: string, key: 'outlinksDepth' | 'inlinksDepth') => void;
  onPreviewPage: (siteNodeKey: string) => void;
  hasDraftChanges: boolean;
  onMarkSensitive?: (siteNodeKey: string, isSensitive: boolean) => void;
  obsidianInfo: ObsidianInfo | null;
}

const SiteNodeSelectionSidebar: React.FC<SiteNodeSelectionSidebarProps> = ({
  selectedNodeKeys,
  graph,
  onClose,
  onSelectedNodeKeysChange,
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
  const [openDropdownSiteNodeKey, setOpenDropdownSiteNodeKey] = useState<string | null>(null);
  const [dropdownButtonRect, setDropdownButtonRect] = useState<{ x: number; y: number } | null>(null);
  const [openDetailsSiteNodeKeys, setOpenDetailsSiteNodeKeys] = useState<Set<string>>(new Set());
  const [outlinksDepthInputsBySiteNodeKey, setOutlinksDepthInputsBySiteNodeKey] = useState<Record<string, string>>({});
  const [inlinksDepthInputsBySiteNodeKey, setInlinksDepthInputsBySiteNodeKey] = useState<Record<string, string>>({});
  const [outlinksDepthOverrideOpenBySiteNodeKey, setOutlinksDepthOverrideOpenBySiteNodeKey] = useState<Record<string, boolean>>({});
  const [inlinksDepthOverrideOpenBySiteNodeKey, setInlinksDepthOverrideOpenBySiteNodeKey] = useState<Record<string, boolean>>({});
  const [isTraversalDetailsModalOpen, setIsTraversalDetailsModalOpen] = useState<boolean>(false);
  const [traversalDetailsSiteNodeKey, setTraversalDetailsSiteNodeKey] = useState<string | null>(null);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState<boolean>(false);
  const [linksModalSiteNodeKey, setLinksModalSiteNodeKey] = useState<string | null>(null);

  // Path collapsing state
  const [expandedPathSiteNodeKeys, setExpandedPathSiteNodeKeys] = useState<Set<string>>(new Set());
  const [shouldCollapsePathBySiteNodeKey, setShouldCollapsePathBySiteNodeKey] = useState<Map<string, boolean>>(new Map());
  const pathMeasureRefsMap = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Clear depth input caches when the graph reloads (e.g. after undo) so the
  // inputs reflect the current config values rather than stale local edits.
  useEffect(() => {
    setOutlinksDepthInputsBySiteNodeKey({});
    setInlinksDepthInputsBySiteNodeKey({});
  }, [graph]);

  // Auto-expand details when only the initial site page is selected
  useEffect(() => {
    if (selectedNodeKeys.size === 1) {
      const siteNodeKey = Array.from(selectedNodeKeys)[0];
      const page = graph.getNode(siteNodeKey);
      if (page && page.depth === 0) {
        setOpenDetailsSiteNodeKeys(prev => {
          if (prev.has(siteNodeKey)) return prev;
          return new Set([...prev, siteNodeKey]);
        });
      }
    }
  }, [selectedNodeKeys, graph]);

  // Measure paths to determine if they should be collapsed
  useLayoutEffect(() => {
    // Get pages with paths that have 4+ components and are currently open in details
    const nodesToMeasure = Array.from(selectedNodeKeys)
      .map(id => graph.getNode(id))
      .filter((page): page is ISiteNode =>
        page !== null &&
        page !== undefined &&
        openDetailsSiteNodeKeys.has(page.siteNodeKey) &&
        Array.isArray(page.path) &&
        page.path.length >= 4
      );

    if (nodesToMeasure.length === 0) return;

    const measurePath = (siteNodeKey: string) => {
      const container = pathMeasureRefsMap.current.get(siteNodeKey);
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
    const newCollapseMap = new Map(shouldCollapsePathBySiteNodeKey);
    nodesToMeasure.forEach(page => {
      const shouldCollapse = measurePath(page.siteNodeKey);
      if (shouldCollapse !== null) {
        newCollapseMap.set(page.siteNodeKey, shouldCollapse);
      }
    });

    // Only update if changed
    const hasChanges = nodesToMeasure.some(page => {
      const prev = shouldCollapsePathBySiteNodeKey.get(page.siteNodeKey);
      const next = newCollapseMap.get(page.siteNodeKey);
      return prev !== next;
    });

    if (hasChanges) {
      setShouldCollapsePathBySiteNodeKey(newCollapseMap);
    }

    // Set up ResizeObserver for dynamic updates
    const resizeObserver = new ResizeObserver(() => {
      const updatedCollapseMap = new Map(shouldCollapsePathBySiteNodeKey);
      let changed = false;

      nodesToMeasure.forEach(page => {
        const shouldCollapse = measurePath(page.siteNodeKey);
        if (shouldCollapse !== null && updatedCollapseMap.get(page.siteNodeKey) !== shouldCollapse) {
          updatedCollapseMap.set(page.siteNodeKey, shouldCollapse);
          changed = true;
        }
      });

      if (changed) {
        setShouldCollapsePathBySiteNodeKey(updatedCollapseMap);
      }
    });

    // Observe all measurement containers
    nodesToMeasure.forEach(page => {
      const container = pathMeasureRefsMap.current.get(page.siteNodeKey);
      if (container) {
        resizeObserver.observe(container);
      }
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedNodeKeys, graph, openDetailsSiteNodeKeys, shouldCollapsePathBySiteNodeKey]);

  const toggleDetailsForPage = (siteNodeKey: string) => {
    setOpenDetailsSiteNodeKeys(prev => {
      const next = new Set(prev);
      if (next.has(siteNodeKey)) {
        next.delete(siteNodeKey);
        // Reset path expansion when details are closed
        setExpandedPathSiteNodeKeys(prevExpanded => {
          if (prevExpanded.has(siteNodeKey)) {
            const nextExpanded = new Set(prevExpanded);
            nextExpanded.delete(siteNodeKey);
            return nextExpanded;
          }
          return prevExpanded;
        });
      } else {
        next.add(siteNodeKey);
      }
      return next;
    });
  };

  const setOutlinksDepthInputForPage = (siteNodeKey: string, value: string) => {
    setOutlinksDepthInputsBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: value }));
  };

  const setInlinksDepthInputForPage = (siteNodeKey: string, value: string) => {
    setInlinksDepthInputsBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: value }));
  };

  const handleSetOutlinksDepthForPage = (siteNodeKey: string) => {
    const raw = outlinksDepthInputsBySiteNodeKey[siteNodeKey] ?? '';
    if (raw === '') return;
    const depth = parseInt(raw, 10);
    if (!isNaN(depth) && depth >= 0) {
      onUpdatePageConfig(siteNodeKey, 'outlinksDepth', depth);
      setOutlinksDepthInputForPage(siteNodeKey, String(depth));
      setOutlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: false }));
    }
  };

  const handleClearOutlinksDepthForPage = (siteNodeKey: string) => {
    onDeletePageConfigKey(siteNodeKey, 'outlinksDepth');
    setOutlinksDepthInputForPage(siteNodeKey, '');
    setOutlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: false }));
  };

  const handleSetInlinksDepthForPage = (siteNodeKey: string) => {
    const raw = inlinksDepthInputsBySiteNodeKey[siteNodeKey] ?? '';
    if (raw === '') return;
    const depth = parseInt(raw, 10);
    if (!isNaN(depth) && depth >= 0) {
      onUpdatePageConfig(siteNodeKey, 'inlinksDepth', depth);
      setInlinksDepthInputForPage(siteNodeKey, String(depth));
      setInlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: false }));
    }
  };

  const handleClearInlinksDepthForPage = (siteNodeKey: string) => {
    onDeletePageConfigKey(siteNodeKey, 'inlinksDepth');
    setInlinksDepthInputForPage(siteNodeKey, '');
    setInlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [siteNodeKey]: false }));
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
        {selectedNodeKeys.size === 0 ? (
          <p className="text-sm text-neutral-500 italic">Please select a page.</p>
        ) : (
          <div className="space-y-2">
            {selectedNodeKeys.size > 2 && (
              <div className="text-sm text-neutral-600">
                {selectedNodeKeys.size} selected
              </div>
            )}
            {selectedNodeKeys.size > 1 && (
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <div className="flex gap-2">
                  {(() => {
                    const hasSensitiveOrFrontier = Array.from(selectedNodeKeys).some(id => {
                      const page = graph.getNode(id);
                      return page && (isEffectivelySensitive(page) || page.isFrontierNode);
                    });
                    const allAlreadyTracked = Array.from(selectedNodeKeys).every(id => {
                      const page = graph.getNode(id);
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
                    disabled={Array.from(selectedNodeKeys).some(id => {
                      const page = graph.getNode(id);
                      return page && page.isFrontierNode;
                    })}
                    className={`flex-1 px-4 py-2 text-sm rounded ${
                      Array.from(selectedNodeKeys).some(id => {
                        const page = graph.getNode(id);
                        return page && page.isFrontierNode;
                      })
                        ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                        : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                    }`}
                  >
                    Blacklist All
                  </button>
                </div>
                {Array.from(selectedNodeKeys)
                  .map(id => graph.getNode(id))
                  .some(page => page && isEffectivelySensitive(page)) && (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 italic">
                      Cannot bulk track all pages because some selected pages are marked as sensitive.
                    </p>
                    <button
                      onClick={() => {
                        const nonSensitiveNodeKeys = Array.from(selectedNodeKeys).filter(
                          id => {
                            const page = graph.getNode(id);
                            return !(page && isEffectivelySensitive(page));
                          }
                        );
                        onSelectedNodeKeysChange(new Set(nonSensitiveNodeKeys));
                      }}
                      className="text-sm text-main-600 hover:text-main-800 hover:underline"
                    >
                      Deselect sensitive pages
                    </button>
                  </div>
                )}
                {Array.from(selectedNodeKeys)
                  .map(id => graph.getNode(id))
                  .some(page => page && page.isFrontierNode) && (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-500 italic">
                      Cannot track/blacklist frontier pages (they are outside the working area).
                    </p>
                    <button
                      onClick={() => {
                        const nonFrontierNodeKeys = Array.from(selectedNodeKeys).filter(
                          id => {
                            const page = graph.getNode(id);
                            return !(page && page.isFrontierNode);
                          }
                        );
                        onSelectedNodeKeysChange(new Set(nonFrontierNodeKeys));
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
          {Array.from(selectedNodeKeys)
            .map((id, originalIndex) => ({ id, originalIndex, page: graph.getNode(id) }))
            .filter((x): x is { id: string; originalIndex: number; page: ISiteNode } => Boolean(x.page))
            .sort((a, b) => {
              // Always order untracked + (effectively) sensitive pages to the top.
              // For all other pages, keep the existing selection order (newest-first insertion).
              const aPriority = !a.page.tracked && isEffectivelySensitive(a.page) ? 0 : 1;
              const bPriority = !b.page.tracked && isEffectivelySensitive(b.page) ? 0 : 1;
              if (aPriority !== bPriority) return aPriority - bPriority;
              return a.originalIndex - b.originalIndex;
            })
            .map(({ page }) => (
              <div key={page!.siteNodeKey} className="p-4 hover:bg-neutral-50" data-testid={`selected-page-${page!.siteNodeKey}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate flex-1 mr-2">{page!.data?.siteNodeName || page!.label}</span>
                  <div className="flex items-center gap-1 flex-none">
                    {/* More options dropdown */}
                    <button
                      onClick={(e) => {
                        if (openDropdownSiteNodeKey === page!.siteNodeKey) {
                          setOpenDropdownSiteNodeKey(null);
                          setDropdownButtonRect(null);
                        } else {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setOpenDropdownSiteNodeKey(page!.siteNodeKey);
                          setDropdownButtonRect({ x: rect.right - 192, y: rect.bottom + 4 });
                        }
                      }}
                      className="px-2 py-1 text-xs rounded text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                      title="More options"
                    >
                      ...
                    </button>
                    {openDropdownSiteNodeKey === page!.siteNodeKey && dropdownButtonRect && (
                      <SiteNodeContextMenu
                        page={page!}
                        graph={graph}
                        position={dropdownButtonRect}
                        onClose={() => { setOpenDropdownSiteNodeKey(null); setDropdownButtonRect(null); }}
                        onTrackPage={onTrackPage}
                        onBlacklistPage={onBlacklistPage}
                        onPreviewPage={onPreviewPage}
                        hasDraftChanges={hasDraftChanges}
                        onSelectedNodeKeysChange={onSelectedNodeKeysChange}
                        onMarkSensitive={onMarkSensitive}
                        obsidianInfo={obsidianInfo}
                      />
                    )}
                    <button
                      onClick={() => {
                        onSelectedNodeKeysChange(new Set(
                          Array.from(selectedNodeKeys).filter(id => id !== page!.siteNodeKey)
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
                  {page!.isFrontierNode && (
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
                    <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Cannot track frontier pages" className="flex-1">
                      <button
                        onClick={() => onTrackPage(page!.siteNodeKey)}
                        disabled={page!.isFrontierNode}
                        className={`w-full px-2 py-1 text-xs rounded ${
                          page!.isFrontierNode
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-success-100 text-success-700 hover:bg-success-200'
                        }`}
                      >
                        Track
                      </button>
                    </DisabledTooltip>
                    {!page!.blacklisted && (
                      <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Cannot blacklist frontier pages" align="right" className="flex-1">
                        <button
                          onClick={() => onBlacklistPage(page!.siteNodeKey)}
                          disabled={page!.isFrontierNode}
                          className={`w-full px-2 py-1 text-xs rounded ${
                            page!.isFrontierNode
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
                    onClick={() => toggleDetailsForPage(page!.siteNodeKey)}
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
                      className={`transition-transform duration-200 ${openDetailsSiteNodeKeys.has(page!.siteNodeKey) ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span>Details</span>
                  </button>

                  {openDetailsSiteNodeKeys.has(page!.siteNodeKey) && (
                    <div className="mt-2 p-2 bg-neutral-50 border border-neutral-200 rounded space-y-2">
                      {/* Path - only show for non-initial pages */}
                      {page!.depth !== 0 && Array.isArray(page!.path) && page!.path.length > 0 && (
                        <div style={{ position: 'relative' }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-semibold text-neutral-700">Path</div>
                            <button
                              onClick={() => {
                                setTraversalDetailsSiteNodeKey(page!.siteNodeKey);
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
                              ref={el => pathMeasureRefsMap.current.set(page!.siteNodeKey, el)}
                              className="flex flex-wrap items-center gap-1"
                              style={{ visibility: 'hidden', position: 'absolute', left: 0, right: 0, pointerEvents: 'none' }}
                              aria-hidden="true"
                            >
                              {page!.path.map((pathSiteNodeKey, idx) => {
                                const pathPage = graph.getNode(pathSiteNodeKey);
                                const label = pathPage?.siteNodeName || pathSiteNodeKey.split('/').pop() || 'Unknown';
                                const isLast = idx === page!.path!.length - 1;
                                return (
                                  <div key={`${page!.siteNodeKey}-measure-${pathSiteNodeKey}-${idx}`} className="flex items-center" data-path-item>
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
                              const shouldCollapse = shouldCollapsePathBySiteNodeKey.get(page!.siteNodeKey) ?? false;
                              const isExpanded = expandedPathSiteNodeKeys.has(page!.siteNodeKey);
                              const showCollapsed = pathLength >= 4 && shouldCollapse && !isExpanded;

                              if (showCollapsed) {
                                // Collapsed view: [first] -> [n more] -> [last]
                                const firstSiteNodeKey = page!.path[0];
                                const lastSiteNodeKey = page!.path[pathLength - 1];
                                const firstPage = graph.getNode(firstSiteNodeKey);
                                const lastPage = graph.getNode(lastSiteNodeKey);
                                const firstLabel = firstPage?.siteNodeName || firstSiteNodeKey.split('/').pop() || 'Unknown';
                                const lastLabel = lastPage?.siteNodeName || lastSiteNodeKey.split('/').pop() || 'Unknown';
                                const middleCount = pathLength - 2;

                                return (
                                  <>
                                    <div className="flex items-center">
                                      <button
                                        onClick={() => onSelectedNodeKeysChange(new Set([...selectedNodeKeys, firstSiteNodeKey]))}
                                        className="px-2 py-0.5 text-xs rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 cursor-pointer"
                                        title={`Select "${firstLabel}"`}
                                      >
                                        {firstLabel}
                                      </button>
                                      <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>
                                    </div>
                                    <button
                                      onClick={() => setExpandedPathSiteNodeKeys(prev => new Set([...prev, page!.siteNodeKey]))}
                                      className="px-2 py-0.5 text-xs rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                                      title="Click to expand full path"
                                    >
                                      {middleCount} more
                                    </button>
                                    <span className="mx-1 text-neutral-400 text-xs">-&gt;</span>
                                    <div className="flex items-center">
                                      <button
                                        onClick={() => onSelectedNodeKeysChange(new Set([...selectedNodeKeys, lastSiteNodeKey]))}
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
                                return page!.path.map((pathSiteNodeKey, idx) => {
                                  const pathPage = graph.getNode(pathSiteNodeKey);
                                  const label = pathPage?.siteNodeName || pathSiteNodeKey.split('/').pop() || 'Unknown';
                                  const isLast = idx === page!.path!.length - 1;
                                  return (
                                    <div key={`${page!.siteNodeKey}-path-${pathSiteNodeKey}-${idx}`} className="flex items-center">
                                      <button
                                        onClick={() => onSelectedNodeKeysChange(new Set([...selectedNodeKeys, pathSiteNodeKey]))}
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
                                {page!.conf?.outlinksDepth ?? page!.remaining_depth}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  outlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ??
                                  String(page!.conf?.outlinksDepth ?? page!.remaining_depth)
                                }
                                onChange={(e) => setOutlinksDepthInputForPage(page!.siteNodeKey, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetOutlinksDepthForPage(page!.siteNodeKey)}
                                disabled={(outlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                            </div>
                          </>
                        ) : outlinksDepthOverrideOpenBySiteNodeKey[page!.siteNodeKey] ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Outlink Depth Override</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.outlinksDepth !== undefined ? (
                                  <span className="flex items-center gap-1">
                                    {page!.traversal_details?.outlinks_depth_inherited !== undefined && (
                                      <>
                                        <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.outlinks_depth_inherited}</span>
                                        <span className="text-amber-500">→</span>
                                      </>
                                    )}
                                    <span className="font-semibold text-neutral-700">{page!.conf.outlinksDepth}</span>
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
                                  outlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ??
                                  (page!.conf?.outlinksDepth === undefined ? '' : String(page!.conf.outlinksDepth))
                                }
                                onChange={(e) => setOutlinksDepthInputForPage(page!.siteNodeKey, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetOutlinksDepthForPage(page!.siteNodeKey)}
                                disabled={(outlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                              <button
                                onClick={() => {
                                  setOutlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: false }));
                                  setOutlinksDepthInputForPage(page!.siteNodeKey, '');
                                }}
                                className="px-2 py-1 text-xs rounded bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : page!.conf?.outlinksDepth !== undefined ? (
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
                                <span className="font-semibold text-neutral-700">{page!.conf.outlinksDepth}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Edit outlink depth override"
                                  onClick={() => setOutlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: true }))}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Remove outlink depth override"
                                  onClick={() => handleClearOutlinksDepthForPage(page!.siteNodeKey)}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-danger-100 hover:text-danger-600'}`}
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
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Add outlink depth override"
                                  onClick={() => setOutlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: true }))}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
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
                                {page!.conf?.inlinksDepth ?? page!.remaining_inlinks_depth ?? 0}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={
                                  inlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ??
                                  String(page!.conf?.inlinksDepth ?? page!.remaining_inlinks_depth ?? 0)
                                }
                                onChange={(e) => setInlinksDepthInputForPage(page!.siteNodeKey, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetInlinksDepthForPage(page!.siteNodeKey)}
                                disabled={(inlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                            </div>
                          </>
                        ) : inlinksDepthOverrideOpenBySiteNodeKey[page!.siteNodeKey] ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-neutral-700">Inlink Depth Override</div>
                              <div className="text-xs text-neutral-500">
                                {page!.conf?.inlinksDepth !== undefined ? (
                                  <span className="flex items-center gap-1">
                                    {page!.traversal_details?.inlinks_depth_inherited !== undefined && (
                                      <>
                                        <span className="line-through decoration-2 text-neutral-400">{page!.traversal_details.inlinks_depth_inherited}</span>
                                        <span className="text-amber-500">→</span>
                                      </>
                                    )}
                                    <span className="font-semibold text-neutral-700">{page!.conf.inlinksDepth}</span>
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
                                  inlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ??
                                  (page!.conf?.inlinksDepth === undefined ? '' : String(page!.conf.inlinksDepth))
                                }
                                onChange={(e) => setInlinksDepthInputForPage(page!.siteNodeKey, e.target.value)}
                                placeholder="depth"
                                className="w-20 px-2 py-1 border border-neutral-300 rounded text-xs bg-white"
                              />
                              <button
                                onClick={() => handleSetInlinksDepthForPage(page!.siteNodeKey)}
                                disabled={(inlinksDepthInputsBySiteNodeKey[page!.siteNodeKey] ?? '') === ''}
                                className="px-2 py-1 text-xs rounded bg-btn-standard-normal text-btn-standard-text hover:bg-btn-standard-hover disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Set
                              </button>
                              <button
                                onClick={() => {
                                  setInlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: false }));
                                  setInlinksDepthInputForPage(page!.siteNodeKey, '');
                                }}
                                className="px-2 py-1 text-xs rounded bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : page!.conf?.inlinksDepth !== undefined ? (
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
                                <span className="font-semibold text-neutral-700">{page!.conf.inlinksDepth}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Edit inlink depth override"
                                  onClick={() => setInlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: true }))}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M12.1 1.5a1.5 1.5 0 012.1 2.1l-9.1 9.2-2.8.7.7-2.8 9.1-9.2zM11 3.4l1.6 1.6" />
                                  </svg>
                                </button>
                              </DisabledTooltip>
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  title="Remove inlink depth override"
                                  onClick={() => handleClearInlinksDepthForPage(page!.siteNodeKey)}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-danger-100 hover:text-danger-600'}`}
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
                              <DisabledTooltip disabled={page!.isFrontierNode} tooltip="Frontier pages cannot be edited" align="right">
                                <button
                                  onClick={() => setInlinksDepthOverrideOpenBySiteNodeKey(prev => ({ ...prev, [page!.siteNodeKey]: true }))}
                                  disabled={page!.isFrontierNode}
                                  className={`w-6 h-6 flex items-center justify-center rounded ${page!.isFrontierNode ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'}`}
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
                              setLinksModalSiteNodeKey(page!.siteNodeKey);
                              setIsLinksModalOpen(true);
                            }}
                            className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                            title="Show all inlinks and outlinks for this page"
                          >
                            Show Links
                          </button>
                        </div>
                        {(() => {
                          const allOutlinks = graph.getAllOutlinkTargets(page!.siteNodeKey);
                          const allInlinks = graph.getAllInlinkSources(page!.siteNodeKey);
                          const outlinksInGraph = allOutlinks.filter(id => graph.getNode(id)).length;
                          const inlinksInGraph = allInlinks.filter(id => graph.getNode(id)).length;
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
      {isTraversalDetailsModalOpen && traversalDetailsSiteNodeKey && graph.getNode(traversalDetailsSiteNodeKey) && (
        <TraversalPathDetailsModal
          isOpen={isTraversalDetailsModalOpen}
          onClose={() => setIsTraversalDetailsModalOpen(false)}
          selectedNode={graph.getNode(traversalDetailsSiteNodeKey)!}
          graph={graph}
        />
      )}

      {/* Site Page Links Modal */}
      {isLinksModalOpen && linksModalSiteNodeKey && (
        <SiteNodeLinksModal
          isOpen={isLinksModalOpen}
          onClose={() => setIsLinksModalOpen(false)}
          initialSiteNodeKey={linksModalSiteNodeKey}
          graph={graph}
          onSelectNode={(siteNodeKey) => {
            const newSelection = new Set(selectedNodeKeys);
            newSelection.add(siteNodeKey);
            onSelectedNodeKeysChange(newSelection);
          }}
          onDeselectNode={(siteNodeKey) => {
            const newSelection = new Set(selectedNodeKeys);
            newSelection.delete(siteNodeKey);
            onSelectedNodeKeysChange(newSelection);
          }}
          selectedNodeKeys={selectedNodeKeys}
          isEffectivelySensitive={isEffectivelySensitive}
        />
      )}
    </>
  );
};

export default SiteNodeSelectionSidebar;
