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

import React, { useState, useMemo, useEffect } from 'react';
import { DisplayGraph, DisplayNode, Highlight } from '../types/displayGraph';
import { API_BASE_URL } from '../../../../shared/utils/apiConfig';
import { isImageFileType } from '../../../../../../shared_code/utils/fileTypeUtils';
import ImageHoverPreview, { HOVER_IMAGE_WIDTH, HOVER_IMAGE_HEIGHT } from './ImageHoverPreview';
import { ExcalidrawThumbnail } from './ExcalidrawThumbnail';
import SiteNodeHoverCard from './SiteNodeHoverCard';
import StructuralTreeRows from './StructuralTreeRows';
import ListNodeGlyph from './ListNodeGlyph';

interface ListViewProps {
  displayGraph: DisplayGraph;
  entrySiteNodeId?: string;
  onPageClick: (siteNodeKey: string) => void;
  siteSlug: string;
  onSiteNodeContextMenu?: (siteNodeKey: string, x: number, y: number) => void;
  selectedNodeKeys?: Set<string>;
}

type SortField = 'title' | 'directory' | 'fileType' | 'depth';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'flat' | 'grouped';

const ListView: React.FC<ListViewProps> = ({
  displayGraph,
  entrySiteNodeId,
  onPageClick,
  siteSlug,
  onSiteNodeContextMenu,
  selectedNodeKeys,
}) => {
  const [sortField, setSortField] = useState<SortField>('depth');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (sessionStorage.getItem('listViewMode') as ViewMode) || 'flat';
  });
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

  useEffect(() => {
    sessionStorage.setItem('listViewMode', viewMode);
  }, [viewMode]);

  const sortedNodes = useMemo(() => {
    const nodes = displayGraph.visibleDisplayNodes;

    return nodes.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title': {
          comparison = a.siteNodeName.localeCompare(b.siteNodeName);
          break;
        }
        case 'directory': {
          const dirA = a.sourceGraphSubdirectory || '';
          const dirB = b.sourceGraphSubdirectory || '';
          comparison = dirA.localeCompare(dirB);
          // Secondary sort by title when directories are equal
          if (comparison === 0) {
            comparison = a.siteNodeName.localeCompare(b.siteNodeName);
          }
          break;
        }
        case 'fileType': {
          comparison = a.fileType.localeCompare(b.fileType);
          // Secondary sort by title when file types are equal
          if (comparison === 0) {
            comparison = a.siteNodeName.localeCompare(b.siteNodeName);
          }
          break;
        }
        case 'depth': {
          const depthA = a.distance ?? Infinity;
          const depthB = b.distance ?? Infinity;
          comparison = depthA - depthB;
          // Secondary sort by title when depths are equal
          if (comparison === 0) {
            comparison = a.siteNodeName.localeCompare(b.siteNodeName);
          }
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [displayGraph, sortField, sortDirection]);

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
    e: React.MouseEvent<Element>,
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

  // Renders the small inline thumbnail beside a page title in the list. Excalidraw
  // drawings can't be `<img src>`'d (the on-disk file is a `.excalidraw.md` whose
  // scene has to be decompressed and rendered) — they go through the vendored
  // renderer instead. Both paths feed the same hover-preview popup.
  const renderInlineThumbnail = (page: { siteNodeName: string; fileType: string; sourceGraphSubdirectory: string }) => {
    if (page.fileType === 'excalidraw') {
      const mdPath = page.sourceGraphSubdirectory
        ? `${page.sourceGraphSubdirectory}/${page.siteNodeName}.excalidraw.md`
        : `${page.siteNodeName}.excalidraw.md`;
      const mdSourceUrl = `${API_BASE_URL}/sites/${siteSlug}/generation/source-file/${encodeURIComponent(mdPath)}`;
      return (
        <ExcalidrawThumbnail
          mdSourceUrl={mdSourceUrl}
          vendorUrl={`${API_BASE_URL}/generation/assets/excalidraw-vendor.js`}
          alt={page.siteNodeName}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-white"
          lazy
          onMouseEnter={(e) => handleImageMouseEnter(e, mdSourceUrl, page.siteNodeName)}
          onMouseLeave={() => setHoveredImage(null)}
        />
      );
    }
    if (isImageFileType(page.fileType)) {
      const imageUrl = `${API_BASE_URL}/sites/${siteSlug}/generation/source-file/${encodeURIComponent(page.sourceGraphSubdirectory ? `${page.sourceGraphSubdirectory}/${page.siteNodeName}.${page.fileType}` : `${page.siteNodeName}.${page.fileType}`)}`;
      return (
        <img
          src={imageUrl}
          alt={page.siteNodeName}
          className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer"
          onMouseEnter={(e) => handleImageMouseEnter(e, imageUrl, page.siteNodeName)}
          onMouseLeave={() => setHoveredImage(null)}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    return null;
  };

  const nodeKindLabel = (page: DisplayNode): string => {
    if (page.siteNodeKind === 'collection') return 'Site home';
    if (page.siteNodeKind === 'folder') return 'Folder';
    return `.${page.fileType}`;
  };

  const handleHighlightMouseEnter = (
    e: React.MouseEvent<Element>,
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
        <SiteNodeHoverCard
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
          Structure
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="min-w-full border-collapse border">
          <thead>
            <tr>
              {viewMode === 'flat' && <th className="border px-4 py-2 bg-gray-50 w-8"></th>}
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
              sortedNodes.map(page => (
                <tr
                  key={page.siteNodeKey}
                  onClick={() => onPageClick(page.siteNodeKey)}
                  onContextMenu={(e) => {
                    if (onSiteNodeContextMenu) {
                      e.preventDefault();
                      onSiteNodeContextMenu(page.siteNodeKey, e.clientX, e.clientY);
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
                    onMouseEnter={(e) => handleHighlightMouseEnter(e, page.siteNodeName, page.highlights)}
                    onMouseLeave={() => setHoveredHighlights(null)}
                  >
                    <ListNodeGlyph node={page} />
                  </td>
                  <td className="border px-4 py-2">
                    <div className="flex items-center gap-2">
                      {page.siteNodeName}
                      {page.siteNodeKind === 'file' && renderInlineThumbnail(page)}
                    </div>
                  </td>
                  <td className="border px-4 py-2 text-neutral-500">
                    {page.sourceGraphSubdirectory || ''}
                  </td>
                  <td className="border px-4 py-2 text-neutral-500 font-mono text-sm">
                    {nodeKindLabel(page)}
                  </td>
                  <td className="border px-4 py-2">
                    {page.distance ?? 'N/A'}
                  </td>
                </tr>
              ))
            ) : (
              <StructuralTreeRows
                displayGraph={displayGraph}
                entrySiteNodeId={entrySiteNodeId}
                selectedNodeKeys={selectedNodeKeys}
                onNodeClick={onPageClick}
                onNodeContextMenu={onSiteNodeContextMenu}
                onGlyphMouseEnter={(event, node) => handleHighlightMouseEnter(event, node.siteNodeName, node.highlights)}
                onGlyphMouseLeave={() => setHoveredHighlights(null)}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ListView;
