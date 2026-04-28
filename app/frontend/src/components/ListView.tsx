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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DisplayGraph, DisplayPage, Highlight } from '../types/displayGraph';
import { API_BASE_URL } from '../utils/apiConfig';
import { isImageFileType } from '../../../shared_code/utils/fileTypeUtils';
import ImageHoverPreview, { HOVER_IMAGE_WIDTH, HOVER_IMAGE_HEIGHT } from './ImageHoverPreview';
import SitePageHoverCard from './SitePageHoverCard';

interface ListViewProps {
  displayGraph: DisplayGraph;
  onPageClick: (pageId: string) => void;
  siteSlug: string;
  onPageContextMenu?: (pageId: string, x: number, y: number) => void;
  selectedPages?: Set<string>;
  onSelectedPagesChange?: (pages: Set<string>) => void;
}

type SortField = 'title' | 'directory' | 'fileType' | 'depth';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'flat' | 'grouped';

interface PageGroup {
  parentId: string | null;
  parentTitle: string;
  parentDistance: number;
  children: DisplayPage[];
}

const ListView: React.FC<ListViewProps> = ({
  displayGraph,
  onPageClick,
  siteSlug,
  onPageContextMenu,
  selectedPages,
  onSelectedPagesChange,
}) => {
  const [sortField, setSortField] = useState<SortField>('depth');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (sessionStorage.getItem('listViewMode') as ViewMode) || 'flat';
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hoveredImage, setHoveredImage] = useState<{
    imageUrl: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredHighlights, setHoveredHighlights] = useState<{
    title: string;
    highlights: Highlight[];
    x: number;
    y: number;
  } | null>(null);
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    sessionStorage.setItem('listViewMode', viewMode);
  }, [viewMode]);

  const sortedPages = useMemo(() => {
    const pages = displayGraph.visibleDisplayPages;

    return pages.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title': {
          comparison = a.title.localeCompare(b.title);
          break;
        }
        case 'directory': {
          const dirA = a.sourceGraphSubdirectory || '';
          const dirB = b.sourceGraphSubdirectory || '';
          comparison = dirA.localeCompare(dirB);
          // Secondary sort by title when directories are equal
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title);
          }
          break;
        }
        case 'fileType': {
          comparison = a.file_type.localeCompare(b.file_type);
          // Secondary sort by title when file types are equal
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title);
          }
          break;
        }
        case 'depth': {
          const depthA = a.distance ?? Infinity;
          const depthB = b.distance ?? Infinity;
          comparison = depthA - depthB;
          // Secondary sort by title when depths are equal
          if (comparison === 0) {
            comparison = a.title.localeCompare(b.title);
          }
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [displayGraph, sortField, sortDirection]);

  // Group pages by their first ancestor (immediate parent in traversal path)
  const groupedPages = useMemo((): PageGroup[] => {
    const pages = sortedPages;
    const pageMap = new Map<string, DisplayPage>();

    // Build a map of all pages by ID for title lookups
    for (const page of displayGraph.visibleDisplayPages) {
      pageMap.set(page.id, page);
    }

    // Group pages by parent ID
    const groups = new Map<string | null, DisplayPage[]>();

    for (const page of pages) {
      const underlyingPage = page.underlyingPage;
      const depth = underlyingPage.depth;
      const path = underlyingPage.path;

      // Determine parent ID
      let parentId: string | null = null;
      if (depth > 0 && path && path.length > 0) {
        parentId = path[depth - 1] ?? null;
      }

      if (!groups.has(parentId)) {
        groups.set(parentId, []);
      }
      groups.get(parentId)!.push(page);
    }

    // Convert to array of PageGroup objects
    const result: PageGroup[] = [];

    for (const [parentId, children] of groups.entries()) {
      // Get parent title and distance
      let parentTitle = 'Root Pages';
      let parentDistance = -1;

      if (parentId !== null) {
        const parentPage = pageMap.get(parentId);
        if (parentPage) {
          parentTitle = parentPage.title;
          parentDistance = parentPage.distance ?? Infinity;
        } else {
          // Parent not in visible pages, use ID as fallback
          parentTitle = parentId;
          parentDistance = Infinity;
        }
      }

      result.push({
        parentId,
        parentTitle,
        parentDistance,
        children,
      });
    }

    // Sort groups by parent distance, then by parent title
    result.sort((a, b) => {
      if (a.parentDistance !== b.parentDistance) {
        return a.parentDistance - b.parentDistance;
      }
      return a.parentTitle.localeCompare(b.parentTitle);
    });

    return result;
  }, [sortedPages, displayGraph]);

  // Toggle a group's expanded/collapsed state
  const toggleGroup = (groupId: string | null) => {
    const key = groupId ?? 'root';
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Toggle selection of all pages in a group
  const toggleGroupSelection = (group: PageGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedPages || !onSelectedPagesChange) return;

    const childIds = group.children.map(p => p.id);
    const allSelected = childIds.every(id => selectedPages.has(id));

    const next = new Set(selectedPages);
    if (allSelected) {
      childIds.forEach(id => next.delete(id));
    } else {
      childIds.forEach(id => next.add(id));
    }
    onSelectedPagesChange(next);
  };

  // Auto-expand all groups when switching from flat to grouped view, or on mount if already grouped
  useEffect(() => {
    const shouldExpand =
      (viewMode === 'grouped' && prevViewModeRef.current === 'flat') ||
      (viewMode === 'grouped' && isInitialMountRef.current);
    if (shouldExpand) {
      const allGroupKeys = new Set<string>();
      for (const group of groupedPages) {
        allGroupKeys.add(group.parentId ?? 'root');
      }
      setExpandedGroups(allGroupKeys);
    }
    prevViewModeRef.current = viewMode;
    isInitialMountRef.current = false;
  }, [viewMode, groupedPages]);

  const handleHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const handleImageMouseEnter = (
    e: React.MouseEvent<HTMLImageElement>,
    imageUrl: string,
    title: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredImage({
      imageUrl,
      title,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const handleHighlightMouseEnter = (
    e: React.MouseEvent<HTMLTableCellElement>,
    title: string,
    highlights: Highlight[]
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredHighlights({
      title,
      highlights,
      x: rect.right + 8,
      y: rect.top + rect.height / 2,
    });
  };

  return (
    <div className="h-full w-full p-4 relative flex flex-col min-h-0">
      {hoveredImage && (
        <ImageHoverPreview
          imageUrl={hoveredImage.imageUrl}
          title={hoveredImage.title}
          style={{
            position: 'fixed',
            left: hoveredImage.x - HOVER_IMAGE_WIDTH / 2,
            top: hoveredImage.y - HOVER_IMAGE_HEIGHT - 40,
          }}
        />
      )}
      {hoveredHighlights && (
        <SitePageHoverCard
          title={hoveredHighlights.title}
          highlights={hoveredHighlights.highlights}
          style={{
            position: 'fixed',
            left: hoveredHighlights.x,
            top: hoveredHighlights.y,
            transform: 'translateY(-50%)',
          }}
        />
      )}
      <div className="mb-3 flex gap-1">
        <button
          onClick={() => setViewMode('flat')}
          className={`px-3 py-1 text-sm rounded ${
            viewMode === 'flat'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Flat
        </button>
        <button
          onClick={() => setViewMode('grouped')}
          className={`px-3 py-1 text-sm rounded ${
            viewMode === 'grouped'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Grouped
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="min-w-full border-collapse border">
          <thead>
            <tr>
              <th className="border px-4 py-2 bg-gray-50 w-8"></th>
              <th 
                onClick={() => handleHeaderClick('title')}
                className="border px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
              >
                Title<SortIndicator field="title" />
              </th>
              <th 
                onClick={() => handleHeaderClick('directory')}
                className="border px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
              >
                Directory<SortIndicator field="directory" />
              </th>
              <th 
                onClick={() => handleHeaderClick('fileType')}
                className="border px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
              >
                Type<SortIndicator field="fileType" />
              </th>
              <th 
                onClick={() => handleHeaderClick('depth')}
                className="border px-4 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
              >
                Distance<SortIndicator field="depth" />
              </th>
            </tr>
          </thead>
          <tbody>
            {viewMode === 'flat' ? (
              sortedPages.map(page => (
                <tr
                  key={page.id}
                  onClick={() => onPageClick(page.id)}
                  onContextMenu={(e) => {
                    if (onPageContextMenu) {
                      e.preventDefault();
                      onPageContextMenu(page.id, e.clientX, e.clientY);
                    }
                  }}
                  className={`
                    cursor-pointer
                    hover:bg-gray-50
                    ${page.isSelected ? 'bg-orange-100' : ''}
                  `}
                >
                  <td
                    className="border px-4 py-2 relative"
                    onMouseEnter={(e) => handleHighlightMouseEnter(e, page.title, page.highlights)}
                    onMouseLeave={() => setHoveredHighlights(null)}
                  >
                    <div className="w-8 h-8 relative">
                      <svg className="absolute inset-0" viewBox="0 0 32 32" width="32" height="32">
                        <circle
                          cx="16"
                          cy="16"
                          r="5"
                          fill="#fff"
                          stroke={page.isSelected ? '#f97316' : '#999'}
                          strokeWidth={page.isSelected ? 2 : 1}
                        />
                        {page.highlights.map((highlight, idx) => (
                          <circle
                            key={idx}
                            cx="16"
                            cy="16"
                            r={8 + (idx * 3)}
                            fill="none"
                            stroke={highlight.color}
                            strokeWidth="4"
                            strokeDasharray={highlight.isDashed ? "4,4" : "none"}
                            opacity="0.8"
                          />
                        ))}
                      </svg>
                    </div>
                  </td>
                  <td className="border px-4 py-2">
                    <div className="flex items-center gap-2">
                      {page.title}
                      {isImageFileType(page.file_type) && (() => {
                        const imageUrl = `${API_BASE_URL}/site/${siteSlug}/source-file/${encodeURIComponent(page.sourceGraphSubdirectory ? `${page.sourceGraphSubdirectory}/${page.title}.${page.file_type}` : `${page.title}.${page.file_type}`)}`;
                        return (
                          <img
                            src={imageUrl}
                            alt={page.title}
                            className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer"
                            onMouseEnter={(e) => handleImageMouseEnter(e, imageUrl, page.title)}
                            onMouseLeave={() => setHoveredImage(null)}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        );
                      })()}
                    </div>
                  </td>
                  <td className="border px-4 py-2 text-neutral-500">
                    {page.sourceGraphSubdirectory || ''}
                  </td>
                  <td className="border px-4 py-2 text-neutral-500 font-mono text-sm">
                    .{page.file_type}
                  </td>
                  <td className="border px-4 py-2">
                    {page.distance ?? 'N/A'}
                  </td>
                </tr>
              ))
            ) : (
              groupedPages.map(group => {
                const groupKey = group.parentId ?? 'root';
                const isExpanded = expandedGroups.has(groupKey);

                return (
                  <React.Fragment key={groupKey}>
                    {/* Group header row */}
                    <tr
                      onClick={() => toggleGroup(group.parentId)}
                      className="cursor-pointer bg-gray-100 hover:bg-gray-200"
                    >
                      <td className="border px-4 py-2" colSpan={5}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-gray-400 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          >
                            ▶
                          </span>
                          {selectedPages && onSelectedPagesChange && (() => {
                            const childIds = group.children.map(p => p.id);
                            const selectedCount = childIds.filter(id => selectedPages.has(id)).length;
                            const allSelected = selectedCount === childIds.length;
                            const someSelected = selectedCount > 0 && !allSelected;
                            return (
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                onChange={() => {}}
                                onClick={(e) => toggleGroupSelection(group, e)}
                                className="cursor-pointer"
                              />
                            );
                          })()}
                          <span className="text-gray-600">{group.parentTitle}</span>
                          <span className="text-gray-500 font-normal">
                            ({group.children.length} {group.children.length === 1 ? 'page' : 'pages'})
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* Child rows */}
                    {isExpanded &&
                      group.children.map(page => (
                        <tr
                          key={page.id}
                          onClick={() => onPageClick(page.id)}
                          onContextMenu={(e) => {
                            if (onPageContextMenu) {
                              e.preventDefault();
                              onPageContextMenu(page.id, e.clientX, e.clientY);
                            }
                          }}
                          className={`
                            cursor-pointer
                            hover:bg-gray-50
                            ${page.isSelected ? 'bg-orange-100' : ''}
                          `}
                        >
                          <td
                            className="border px-4 py-2 pl-8 relative"
                            onMouseEnter={(e) => handleHighlightMouseEnter(e, page.title, page.highlights)}
                            onMouseLeave={() => setHoveredHighlights(null)}
                          >
                            <div className="w-8 h-8 relative">
                              <svg className="absolute inset-0" viewBox="0 0 32 32" width="32" height="32">
                                <circle
                                  cx="16"
                                  cy="16"
                                  r="5"
                                  fill="#fff"
                                  stroke={page.isSelected ? '#f97316' : '#999'}
                                  strokeWidth={page.isSelected ? 2 : 1}
                                />
                                {page.highlights.map((highlight, idx) => (
                                  <circle
                                    key={idx}
                                    cx="16"
                                    cy="16"
                                    r={8 + (idx * 3)}
                                    fill="none"
                                    stroke={highlight.color}
                                    strokeWidth="4"
                                    strokeDasharray={highlight.isDashed ? "4,4" : "none"}
                                    opacity="0.8"
                                  />
                                ))}
                              </svg>
                            </div>
                          </td>
                          <td className="border px-4 py-2 pl-8">
                            <div className="flex items-center gap-2">
                              {page.title}
                              {isImageFileType(page.file_type) && (() => {
                                const imageUrl = `${API_BASE_URL}/site/${siteSlug}/source-file/${encodeURIComponent(page.sourceGraphSubdirectory ? `${page.sourceGraphSubdirectory}/${page.title}.${page.file_type}` : `${page.title}.${page.file_type}`)}`;
                                return (
                                  <img
                                    src={imageUrl}
                                    alt={page.title}
                                    className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer"
                                    onMouseEnter={(e) => handleImageMouseEnter(e, imageUrl, page.title)}
                                    onMouseLeave={() => setHoveredImage(null)}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                );
                              })()}
                            </div>
                          </td>
                          <td className="border px-4 py-2 text-neutral-500">
                            {page.sourceGraphSubdirectory || ''}
                          </td>
                          <td className="border px-4 py-2 text-neutral-500 font-mono text-sm">
                            .{page.file_type}
                          </td>
                          <td className="border px-4 py-2">
                            {page.distance ?? 'N/A'}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ListView; 