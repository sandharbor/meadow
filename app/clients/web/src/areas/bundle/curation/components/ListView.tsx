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
import { apiUrl } from '../../../../shared/utils/apiClient';
import { isImageFileType } from '../../../../../../../shared_code/utils/fileTypeUtils';
import { AuthenticatedImage } from './AuthenticatedImage';
import ImageHoverPreview, { HOVER_IMAGE_WIDTH, HOVER_IMAGE_HEIGHT } from './ImageHoverPreview';
import { ExcalidrawThumbnail } from './ExcalidrawThumbnail';
import BundleNodeHoverCard from './BundleNodeHoverCard';
import StructuralTreeRows from './StructuralTreeRows';
import ListNodeGlyph from './ListNodeGlyph';

interface ListViewProps {
  displayGraph: DisplayGraph;
  entryBundleNodeId?: string;
  onPageClick: (bundleNodeKey: string) => void;
  bundleSlug: string;
  onBundleNodeContextMenu?: (bundleNodeKey: string, x: number, y: number) => void;
  selectedNodeKeys?: Set<string>;
}

export type SortField = 'title' | 'directory' | 'fileType' | 'depth';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'flat' | 'grouped';

export function compareListNodes(
  a: DisplayNode,
  b: DisplayNode,
  sortField: SortField,
  sortDirection: SortDirection,
): number {
  let comparison = 0;

  switch (sortField) {
    case 'title': {
      comparison = a.bundleNodeName.localeCompare(b.bundleNodeName);
      break;
    }
    case 'directory': {
      comparison = a.sourceGraphSubdirectory.localeCompare(b.sourceGraphSubdirectory);
      if (comparison === 0) comparison = a.bundleNodeName.localeCompare(b.bundleNodeName);
      break;
    }
    case 'fileType': {
      comparison = a.fileType.localeCompare(b.fileType);
      if (comparison === 0) comparison = a.bundleNodeName.localeCompare(b.bundleNodeName);
      break;
    }
    case 'depth': {
      const aDistance = a.distance;
      const bDistance = b.distance;
      comparison = aDistance === undefined
        ? (bDistance === undefined ? 0 : 1)
        : bDistance === undefined ? -1 : aDistance - bDistance;
      if (comparison === 0) comparison = a.bundleNodeName.localeCompare(b.bundleNodeName);
      break;
    }
  }

  return sortDirection === 'asc' ? comparison : -comparison;
}

const ListView: React.FC<ListViewProps> = ({
  displayGraph,
  entryBundleNodeId,
  onPageClick,
  bundleSlug,
  onBundleNodeContextMenu,
  selectedNodeKeys,
}) => {
  const [sortField, setSortField] = useState<SortField>('depth');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (sessionStorage.getItem('listViewMode') as ViewMode) || 'flat';
  });
  const [hoveredImage, setHoveredImage] = useState<{
    imagePath: string;
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

  const compareNodes = React.useCallback(
    (a: DisplayNode, b: DisplayNode) => compareListNodes(a, b, sortField, sortDirection),
    [sortDirection, sortField],
  );

  const sortedNodes = useMemo(
    () => [...displayGraph.visibleDisplayNodes].sort(compareNodes),
    [compareNodes, displayGraph],
  );

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
    imagePath: string,
    title: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredImage({
      imagePath,
      title,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  // Renders the small inline thumbnail beside a page title in the list. Excalidraw
  // drawings can't be `<img src>`'d (the on-disk file is a `.excalidraw.md` whose
  // scene has to be decompressed and rendered) — they go through the vendored
  // renderer instead. Both paths feed the same hover-preview popup.
  const renderInlineThumbnail = (page: { bundleNodeName: string; fileType: string; sourceGraphSubdirectory: string }) => {
    if (page.fileType === 'excalidraw') {
      const mdPath = page.sourceGraphSubdirectory
        ? `${page.sourceGraphSubdirectory}/${page.bundleNodeName}.excalidraw.md`
        : `${page.bundleNodeName}.excalidraw.md`;
      const mdSourcePath = `bundles/${bundleSlug}/generation/source-file/${encodeURIComponent(mdPath)}`;
      return (
        <ExcalidrawThumbnail
          mdSourcePath={mdSourcePath}
          vendorUrl={apiUrl('generation/assets/excalidraw-vendor.js')}
          alt={page.bundleNodeName}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-white"
          lazy
          onMouseEnter={(e) => handleImageMouseEnter(e, mdSourcePath, page.bundleNodeName)}
          onMouseLeave={() => setHoveredImage(null)}
        />
      );
    }
    if (isImageFileType(page.fileType)) {
      const imagePath = `bundles/${bundleSlug}/generation/source-file/${encodeURIComponent(page.sourceGraphSubdirectory ? `${page.sourceGraphSubdirectory}/${page.bundleNodeName}.${page.fileType}` : `${page.bundleNodeName}.${page.fileType}`)}`;
      return (
        <AuthenticatedImage
          sourcePath={imagePath}
          alt={page.bundleNodeName}
          className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer"
          onMouseEnter={(e) => handleImageMouseEnter(e, imagePath, page.bundleNodeName)}
          onMouseLeave={() => setHoveredImage(null)}
        />
      );
    }
    return null;
  };

  const nodeKindLabel = (page: DisplayNode): string => {
    if (page.bundleNodeKind === 'collection') return 'Bundle home';
    if (page.bundleNodeKind === 'folder') return 'Folder';
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
          imagePath={hoveredImage.imagePath}
          title={hoveredImage.title}
          style={{
            position: 'fixed',
            left: hoveredImage.x - HOVER_IMAGE_WIDTH / 2,
            top: hoveredImage.y - HOVER_IMAGE_HEIGHT - 40,
          }}
        />
      )}
      {hoveredHighlights && (
        <BundleNodeHoverCard
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
                  key={page.bundleNodeKey}
                  data-bundle-node-key={page.bundleNodeKey}
                  onClick={() => onPageClick(page.bundleNodeKey)}
                  onContextMenu={(e) => {
                    if (onBundleNodeContextMenu) {
                      e.preventDefault();
                      onBundleNodeContextMenu(page.bundleNodeKey, e.clientX, e.clientY);
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
                    onMouseEnter={(e) => handleHighlightMouseEnter(e, page.bundleNodeName, page.highlights)}
                    onMouseLeave={() => setHoveredHighlights(null)}
                  >
                    <ListNodeGlyph node={page} />
                  </td>
                  <td className="border px-4 py-2">
                    <div className="flex items-center gap-2">
                      {page.bundleNodeName}
                      {page.bundleNodeKind === 'file' && renderInlineThumbnail(page)}
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
                entryBundleNodeId={entryBundleNodeId}
                selectedNodeKeys={selectedNodeKeys}
                compareNodes={compareNodes}
                onNodeClick={onPageClick}
                onNodeContextMenu={onBundleNodeContextMenu}
                onGlyphMouseEnter={(event, node) => handleHighlightMouseEnter(event, node.bundleNodeName, node.highlights)}
                onGlyphMouseLeave={() => setHoveredHighlights(null)}
                renderInlineThumbnail={renderInlineThumbnail}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ListView;
