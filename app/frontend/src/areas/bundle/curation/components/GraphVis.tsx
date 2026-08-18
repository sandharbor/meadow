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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Graph } from '../../../../../../shared_code/types/graph';
import { IFilter } from '../types/filters';
import { DisplayGraph, DisplayNode, Highlight } from '../types/displayGraph';
import { isImageFileType } from '../../../../../../shared_code/utils/fileTypeUtils';
import ImageHoverPreview, { HOVER_IMAGE_WIDTH } from './ImageHoverPreview';
import BundleNodeHoverCard from './BundleNodeHoverCard';
import DepthCallout, { useDepthCalloutDismissal, useHasFrontierOutlinks } from './DepthCallout';
import { computeLabelPlacements } from '../utils/graphSearchLabels';
import GraphSearchLabels from './GraphSearchLabels';
import BundleNodeGlyph, { BUNDLE_NODE_RADIUS } from './BundleNodeGlyph';
import { calculateGraphLayout, type GraphLayoutGuide } from '../utils/graphLayout';
import {
  DEFAULT_VIEWBOX,
  MAX_ZOOM,
  MIN_ZOOM,
  type NodePosition,
  type SelectionBox,
  type ViewBox,
} from '../types/graphViewport';

interface GraphVisProps {
  graph: Graph;
  displayGraph: DisplayGraph;
  filters: IFilter[];
  selectedNodeKeys: Set<string>;
  onSelectedNodeKeysChange: (bundleNodeKeys: Set<string>) => void;
  bundleSlug: string;
  graphUpdateTrigger?: number;
  onBundleNodeContextMenu?: (bundleNodeKey: string, x: number, y: number) => void;
  isBundlePreviewOnlyActive?: boolean;
  bundlePreviewHover?: boolean;
  isFolderBasedBundle: boolean;
}

const GraphVis: React.FC<GraphVisProps> = ({
  graph,
  displayGraph,
  filters,
  selectedNodeKeys,
  onSelectedNodeKeysChange,
  bundleSlug,
  graphUpdateTrigger,
  onBundleNodeContextMenu,
  isBundlePreviewOnlyActive,
  bundlePreviewHover,
  isFolderBasedBundle,
}) => {
  const [positions, setPositions] = useState<Map<string, NodePosition>>(new Map());
  const [layoutGuides, setLayoutGuides] = useState<GraphLayoutGuide[]>([]);
  const [showSemanticEdges, setShowSemanticEdges] = useState(true);
  const [showStructuralEdges, setShowStructuralEdges] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    x: number;
    y: number;
    title: string;
    isImage: boolean;
    imagePath?: string;
    highlights: Highlight[];
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { calloutDismissed, handleDismissCallout } = useDepthCalloutDismissal();
  const hasFrontierOutlinks = useHasFrontierOutlinks(graph, graphUpdateTrigger);

  // Bundle preview hover state

  // Compute set of "bundle page" IDs (tracked, not blacklisted, not frontier)
  const previewBundleNodeKeys = useMemo(() => {
    const ids = new Set<string>();
    graph.getAllNodes().forEach(page => {
      if (page.tracked && !page.blacklisted && !page.isFrontierNode) {
        ids.add(page.bundleNodeKey);
      }
    });
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- graphUpdateTrigger forces recompute when graph is mutated in-place
  }, [graph, graphUpdateTrigger]);

  // Whether bundle preview is active (either hovering or solo clicked)
  const isBundlePreviewActive = bundlePreviewHover || isBundlePreviewOnlyActive;

  // Box selection state
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartedOnNodeRef = useRef(false);

  // Zoom and pan state
  const [viewBox, setViewBox] = useState<ViewBox>(DEFAULT_VIEWBOX);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; viewBoxX: number; viewBoxY: number } | null>(null);
  const isAnimatingRef = useRef(false);
  const pendingAnimationRef = useRef(false);

  const calculateLayout = useCallback((nodes: DisplayNode[], includeHidden: boolean = false) => (
    calculateGraphLayout(nodes, graph.getAllEdges(), includeHidden)
  ), [graph]);

  // Calculate page positions
  useEffect(() => {
    if (!containerRef.current) return;

    // Skip if animation is already running to avoid compounding animations
    // Mark that we have a pending update so we re-animate when current animation finishes
    if (isAnimatingRef.current) {
      pendingAnimationRef.current = true;
      return;
    }

    const layout = calculateLayout(displayGraph.allDisplayNodes, true);
    const newPositions = layout.positions;
    setLayoutGuides(layout.guides);

    if (positions.size === 0) {
      // Initial position setup - no animation
      setPositions(newPositions);
    } else {
      // Animate to new positions using a fixed number of frames
      // to avoid performance issues with many elements
      const startPositions = new Map(positions);
      const totalFrames = 10;
      let currentFrame = 0;

      isAnimatingRef.current = true;
      pendingAnimationRef.current = false;

      const animate = () => {
        currentFrame++;
        const progress = currentFrame / totalFrames;

        // Ease in-out function
        const easeProgress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentPositions = new Map<string, NodePosition>();

        newPositions.forEach((endPos, bundleNodeKey) => {
          const startPos = startPositions.get(bundleNodeKey);
          if (startPos) {
            currentPositions.set(bundleNodeKey, {
              x: startPos.x + (endPos.x - startPos.x) * easeProgress,
              y: startPos.y + (endPos.y - startPos.y) * easeProgress,
            });
          } else {
            currentPositions.set(bundleNodeKey, endPos);
          }
        });

        setPositions(currentPositions);

        if (currentFrame < totalFrames) {
          requestAnimationFrame(animate);
        } else {
          isAnimatingRef.current = false;
          // If there was a pending update during animation, trigger a re-render
          // by setting positions to trigger the effect again
          if (pendingAnimationRef.current) {
            pendingAnimationRef.current = false;
            // Force re-run by setting the same positions (effect will recalculate)
            setPositions(new Map(currentPositions));
          }
        }
      };

      requestAnimationFrame(animate);
    }
  // graphUpdateTrigger forces recompute when graph is mutated in-place.
  }, [displayGraph, positions, calculateLayout, graphUpdateTrigger]);

  // Convert screen coordinates to SVG coordinates
  const screenToSVGCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // Get pages within a selection box
  const getNodeKeysInBox = useCallback((box: SelectionBox): string[] => {
    const minX = Math.min(box.startX, box.currentX);
    const maxX = Math.max(box.startX, box.currentX);
    const minY = Math.min(box.startY, box.currentY);
    const maxY = Math.max(box.startY, box.currentY);

    const nodeKeysInBox: string[] = [];
    displayGraph.allDisplayNodes.forEach(page => {
      if (!page.isVisible) return;
      const pos = positions.get(page.bundleNodeKey);
      if (!pos) return;
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
        nodeKeysInBox.push(page.bundleNodeKey);
      }
    });
    return nodeKeysInBox;
  }, [displayGraph, positions]);

  // Pan handlers - middle mouse button (defined before mouse handlers that use them)
  const handlePanStart = useCallback((e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>) => {
    // Middle mouse button (button 1)
    if (e.button !== 1) return;
    e.preventDefault();
    
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      viewBoxX: viewBox.x,
      viewBoxY: viewBox.y,
    };
  }, [viewBox]);

  const handlePanMove = useCallback((e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>) => {
    if (!isPanning || !panStartRef.current || !svgRef.current) return;

    // Capture ref values up front — the functional setViewBox updater below may be
    // invoked later (or replayed) by React, at which point panStartRef.current could
    // have been nulled by handlePanEnd/handleMouseLeave running in between.
    const panStart = panStartRef.current;

    // Calculate how much the mouse has moved in screen pixels
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    // Convert screen pixels to SVG units
    const svgRect = svgRef.current.getBoundingClientRect();
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;

    // Pan in the opposite direction of mouse movement
    setViewBox(prev => ({
      ...prev,
      x: panStart.viewBoxX - dx * scaleX,
      y: panStart.viewBoxY - dy * scaleY,
    }));
  }, [viewBox, isPanning]);

  const handlePanEnd = useCallback((e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, []);

  // Clamp SVG coordinates to the current viewBox bounds
  const clampToViewBox = useCallback((coords: { x: number; y: number }): { x: number; y: number } => {
    return {
      x: Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width, coords.x)),
      y: Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height, coords.y)),
    };
  }, [viewBox]);

  // Pointer/mouse handlers for box selection
  // Uses pointer capture so drag continues even when pointer leaves the SVG
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Handle middle mouse button for panning
    if (e.button === 1) {
      handlePanStart(e);
      return;
    }

    // Only handle left mouse button for selection
    if (e.button !== 0) return;

    // Check if click started on a page (by checking target)
    const target = e.target as SVGElement;
    const isPageClick = target.closest('g[class*="cursor-pointer"]');

    if (isPageClick) {
      dragStartedOnNodeRef.current = true;
      return;
    }

    dragStartedOnNodeRef.current = false;
    const svgCoords = screenToSVGCoords(e.clientX, e.clientY);
    if (!svgCoords) return;

    // Capture pointer so we keep receiving events even outside the SVG
    (e.target as Element).setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    setSelectionBox({
      startX: svgCoords.x,
      startY: svgCoords.y,
      currentX: svgCoords.x,
      currentY: svgCoords.y,
    });
  }, [screenToSVGCoords, handlePanStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Handle panning
    if (isPanning) {
      handlePanMove(e);
      return;
    }

    // Handle selection box dragging
    if (!isDraggingRef.current || !selectionBox) return;

    const svgCoords = screenToSVGCoords(e.clientX, e.clientY);
    if (!svgCoords) return;

    // Clamp to viewBox so the selection box stays within the graph area
    const clamped = clampToViewBox(svgCoords);

    setSelectionBox(prev => prev ? {
      ...prev,
      currentX: clamped.x,
      currentY: clamped.y,
    } : null);
  }, [screenToSVGCoords, selectionBox, handlePanMove, isPanning, clampToViewBox]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Release pointer capture
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    // Handle pan end
    if (e.button === 1) {
      handlePanEnd(e);
      return;
    }

    if (!isDraggingRef.current || !selectionBox) {
      isDraggingRef.current = false;
      setSelectionBox(null);
      return;
    }

    isDraggingRef.current = false;

    // Calculate selected pages from box
    const nodeKeysInBox = getNodeKeysInBox(selectionBox);

    // If shift key is held, add to existing selection; otherwise replace
    if (e.shiftKey) {
      const next = new Set(selectedNodeKeys);
      nodeKeysInBox.forEach(id => next.add(id));
      onSelectedNodeKeysChange(next);
    } else {
      onSelectedNodeKeysChange(new Set(nodeKeysInBox));
    }

    setSelectionBox(null);
  }, [selectionBox, getNodeKeysInBox, selectedNodeKeys, onSelectedNodeKeysChange, handlePanEnd]);

  const handleMouseLeave = useCallback(() => {
    // Cancel panning if mouse leaves (drag selection uses pointer capture, so it's unaffected)
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, [isPanning]);

  const handlePageClick = (bundleNodeKey: string) => {
    const next = new Set(selectedNodeKeys);
    if (next.has(bundleNodeKey)) {
      next.delete(bundleNodeKey);
    } else {
      next.add(bundleNodeKey);
    }
    onSelectedNodeKeysChange(next);
  };

  // Zoom handler - wheel event
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    
    // Get mouse position in SVG coordinates before zoom
    const svgCoords = screenToSVGCoords(e.clientX, e.clientY);
    if (!svgCoords) return;

    // Calculate zoom factor (positive deltaY = scroll down = zoom out)
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    
    // Calculate new dimensions
    const newWidth = viewBox.width * delta;
    const newHeight = viewBox.height * delta;
    
    // Check zoom limits (based on original viewBox size)
    const zoomLevel = DEFAULT_VIEWBOX.width / newWidth;
    if (zoomLevel < MIN_ZOOM || zoomLevel > MAX_ZOOM) return;
    
    // Adjust position to zoom towards mouse cursor
    // The mouse position should remain at the same screen location after zoom
    const mouseXRatio = (svgCoords.x - viewBox.x) / viewBox.width;
    const mouseYRatio = (svgCoords.y - viewBox.y) / viewBox.height;
    
    const newX = svgCoords.x - mouseXRatio * newWidth;
    const newY = svgCoords.y - mouseYRatio * newHeight;
    
    setViewBox({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
  }, [viewBox, screenToSVGCoords]);

  // Reset zoom and pan
  const handleResetView = useCallback(() => {
    setViewBox(DEFAULT_VIEWBOX);
  }, []);

  // Fit view to selected pages
  const handleFitToSelection = useCallback(() => {
    if (selectedNodeKeys.size === 0) return;

    // Find bounding box of selected pages
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedNodeKeys.forEach(bundleNodeKey => {
      const pos = positions.get(bundleNodeKey);
      if (pos) {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x);
        maxY = Math.max(maxY, pos.y);
      }
    });
    
    if (minX === Infinity) return; // No positions found
    
    // Add padding around the selection
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Calculate dimensions
    const width = maxX - minX;
    const height = maxY - minY;
    
    // Maintain aspect ratio of the default viewBox
    const aspectRatio = DEFAULT_VIEWBOX.width / DEFAULT_VIEWBOX.height;
    let newWidth = width;
    let newHeight = height;
    
    if (width / height > aspectRatio) {
      // Width is the limiting factor
      newHeight = width / aspectRatio;
    } else {
      // Height is the limiting factor
      newWidth = height * aspectRatio;
    }
    
    // Center the selection in the new viewBox
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setViewBox({
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
  }, [selectedNodeKeys, positions]);

  // Check if view is modified from default
  const isViewModified = viewBox.x !== DEFAULT_VIEWBOX.x || 
                         viewBox.y !== DEFAULT_VIEWBOX.y || 
                         viewBox.width !== DEFAULT_VIEWBOX.width || 
                         viewBox.height !== DEFAULT_VIEWBOX.height;
  
  const hasSelection = selectedNodeKeys.size > 0;

  // Get initial page screen position for callout placement
  const getInitialPageScreenPosition = useCallback((): { x: number; y: number } | null => {
    if (!svgRef.current || !containerRef.current) return null;

    const initialPage = displayGraph.allDisplayNodes.find(n => n.distance === 0);
    if (!initialPage) return null;

    const pagePos = positions.get(initialPage.bundleNodeKey);
    if (!pagePos) return null;

    const pt = svgRef.current.createSVGPoint();
    pt.x = pagePos.x;
    pt.y = pagePos.y;
    const ctm = svgRef.current.getScreenCTM();
    const containerRect = containerRef.current.getBoundingClientRect();

    if (ctm) {
      const screenPt = pt.matrixTransform(ctm);
      return {
        x: screenPt.x - containerRect.left,
        y: screenPt.y - containerRect.top,
      };
    }
    return null;
  }, [displayGraph, positions]);

  const showDepthCallout = hasFrontierOutlinks && calloutDismissed === false && positions.size > 0;
  const initialPageScreenPos = showDepthCallout ? getInitialPageScreenPosition() : null;

  // Extract search text from filters for label highlighting
  const searchText = useMemo(() => {
    const searchFilter = filters.find(f => f.id === 'search-by-title-filter');
    return searchFilter?.bundleNodeSelectors[0]?.searchInput || '';
  }, [filters]);

  // Compute search result label placements
  const searchLabelPlacements = useMemo(() => {
    const titledNodes = displayGraph.allDisplayNodes
      .filter(p => p.isVisible && p.showTitle)
      .map(p => {
        const pos = positions.get(p.bundleNodeKey);
        return pos ? { bundleNodeKey: p.bundleNodeKey, bundleNodeName: p.bundleNodeName, nodeX: pos.x, nodeY: pos.y, titleFilterColors: p.titleFilterColors } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return computeLabelPlacements(titledNodes, searchText, BUNDLE_NODE_RADIUS, 4);
  }, [displayGraph, positions, searchText]);

  return (
    <div className="w-full relative bg-white min-h-[300px] h-full">
      {/* View control buttons */}
      <div className="absolute top-10 right-2 z-10 flex gap-1">
        {isFolderBasedBundle && (
          <>
            <button
              type="button"
              onClick={() => setShowSemanticEdges(value => !value)}
              aria-pressed={showSemanticEdges}
              className={`px-2 py-1 text-xs rounded border ${showSemanticEdges ? 'bg-neutral-100 border-neutral-300' : 'bg-white text-neutral-400 border-neutral-200'}`}
              title="Toggle semantic-link edges"
            >
              Links
            </button>
            <button
              type="button"
              onClick={() => setShowStructuralEdges(value => !value)}
              aria-pressed={showStructuralEdges}
              className={`px-2 py-1 text-xs rounded border ${showStructuralEdges ? 'bg-blue-50 border-blue-300' : 'bg-white text-neutral-400 border-neutral-200'}`}
              title="Toggle folder and bundle-home structure"
            >
              Structure
            </button>
          </>
        )}
        {/* Fit to selection button - shown when pages are selected */}
        {hasSelection && (
          <button
            onClick={handleFitToSelection}
            className="p-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded shadow-sm border border-neutral-300 transition-colors"
            title="Fit view to selection"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {/* Crosshair/target icon */}
              <circle cx="8" cy="8" r="3" />
              <line x1="8" y1="1" x2="8" y2="4" />
              <line x1="8" y1="12" x2="8" y2="15" />
              <line x1="1" y1="8" x2="4" y2="8" />
              <line x1="12" y1="8" x2="15" y2="8" />
            </svg>
          </button>
        )}
        {/* Reset view button - shown when zoomed/panned */}
        {isViewModified && (
          <button
            onClick={handleResetView}
            className="p-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded shadow-sm border border-neutral-300 transition-colors"
            title="Reset to default view (show all)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {/* Expand/fit-all icon - box with arrows pointing outward */}
              <rect x="3" y="3" width="10" height="10" rx="1" />
              <path d="M1 1 L4 4 M1 1 L1 4 M1 1 L4 1" />
              <path d="M15 1 L12 4 M15 1 L15 4 M15 1 L12 1" />
              <path d="M1 15 L4 12 M1 15 L1 12 M1 15 L4 15" />
              <path d="M15 15 L12 12 M15 15 L15 12 M15 15 L12 15" />
            </svg>
          </button>
        )}
      </div>



      {/* Depth callout - shown when only the initial page is tracked */}
      {showDepthCallout && initialPageScreenPos && (
        <DepthCallout position={initialPageScreenPos} onDismiss={handleDismissCallout} />
      )}

      <div ref={containerRef} className="w-full h-full">
        {hoveredNode && (
          hoveredNode.isImage && hoveredNode.imagePath ? (
            <ImageHoverPreview
              imagePath={hoveredNode.imagePath}
              title={hoveredNode.title}
              style={{
                position: 'absolute',
                left: hoveredNode.x - HOVER_IMAGE_WIDTH / 2, // center horizontally
                top: hoveredNode.y + 20, // position below page nodes
              }}
            />
          ) : (
            <BundleNodeHoverCard
              title={hoveredNode.title}
              highlights={hoveredNode.highlights}
              style={{
                position: 'absolute',
                left: hoveredNode.x - 40, // center horizontally
                top: hoveredNode.y + 20, // position below page nodes
              }}
            />
          )
        )}
        <svg 
          ref={svgRef} 
          className="w-full h-full" 
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMin meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()} // Prevent context menu on middle click
          style={{ cursor: isPanning ? 'grabbing' : 'default', touchAction: 'none' }}
        >
          <defs>
            {/* Arrowheads for normal (unselected) edges - tracked targets */}
            <marker
              id="arrowhead-end"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#cbd5e1" /> {/* neutral-300 (for tracked) */}
            </marker>
            <marker
              id="arrowhead-start"
              markerWidth="8"
              markerHeight="6"
              refX="0"
              refY="3"
              orient="auto"
            >
              <polygon points="8 0, 0 3, 8 6" fill="#cbd5e1" /> {/* neutral-300 (for tracked) */}
            </marker>

            {/* Arrowheads for edges pointing to untracked pages (lighter color) */}
            <marker
              id="arrowhead-end-untracked"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#e2e8f0" /> {/* neutral-200, lighter for untracked */}
            </marker>
            <marker
              id="arrowhead-start-untracked"
              markerWidth="8"
              markerHeight="6"
              refX="0"
              refY="3"
              orient="auto"
            >
              <polygon points="8 0, 0 3, 8 6" fill="#e2e8f0" /> {/* neutral-200, lighter for untracked */}
            </marker>

            {/* Arrowheads for selected edges */}
            <marker
              id="arrowhead-end-selected"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#fcd34d" /> {/* warning-300 */}
            </marker>
            <marker
              id="arrowhead-start-selected"
              markerWidth="8"
              markerHeight="6"
              refX="0"
              refY="3"
              orient="auto"
            >
              <polygon points="8 0, 0 3, 8 6" fill="#fcd34d" /> {/* warning-300 */}
            </marker>

            {/* Arrowhead for search label connector lines */}
            <marker
              id="label-connector-arrow"
              markerWidth="4"
              markerHeight="3"
              refX="0"
              refY="1.5"
              orient="auto"
            >
              <polygon points="4 0, 0 1.5, 4 3" fill="#d1d5db" />
            </marker>
          </defs>

          {/* Folder-derived bundles use a structural band followed by ordinary depth rows. */}
          <g aria-hidden="true" pointerEvents="none">
            {layoutGuides.map((guide, index) => (
              guide.kind === 'section' ? (
                <g key={`${guide.kind}-${guide.label}-${index}`}>
                  <text
                    x="5"
                    y={guide.y}
                    fill="#64748b"
                    fontSize="3.2"
                    fontWeight="600"
                  >
                    {guide.label}
                  </text>
                  <line
                    x1="5"
                    x2="295"
                    y1={guide.y + 2}
                    y2={guide.y + 2}
                    stroke="#e2e8f0"
                    strokeWidth="0.4"
                  />
                </g>
              ) : (
                <text
                  key={`${guide.kind}-${guide.label}-${index}`}
                  x="5"
                  y={guide.y + 1}
                  fill="#94a3b8"
                  fontSize="2.7"
                >
                  {guide.label}
                </text>
              )
            ))}
          </g>

          {/* Draw edges */}
          {graph.getAllEdges().map((edge, index) => {
            const isStructural = edge.bundleEdgeKind !== 'semanticLink';
            const shouldShowEdge = isFolderBasedBundle
              ? (isStructural ? showStructuralEdges : showSemanticEdges)
              : !isStructural;
            if (!shouldShowEdge) return null;
            const sourcePage = displayGraph.getDisplayNode(edge.source);
            const targetPage = displayGraph.getDisplayNode(edge.target);
            if (!sourcePage || !targetPage) return null;

            const sourcePos = positions.get(edge.source);
            const targetPos = positions.get(edge.target);
            if (!sourcePos || !targetPos) return null;

            const sourceVisible = isBundlePreviewActive
              ? previewBundleNodeKeys.has(edge.source)
              : sourcePage.isVisible;
            const targetVisible = isBundlePreviewActive
              ? previewBundleNodeKeys.has(edge.target)
              : targetPage.isVisible;

            // Skip edges where both endpoints are hidden, or either endpoint
            // is hidden during bundle preview (non-bundle edges shouldn't show at all)
            if (!sourceVisible && !targetVisible) return null;
            if (isBundlePreviewActive && (!sourceVisible || !targetVisible)) return null;

            const visibilityOpacity = (!sourceVisible || !targetVisible) ? 0.1 : 1;
            const isSelected = selectedNodeKeys.has(edge.source) && selectedNodeKeys.has(edge.target);

            // Determine tracked status for color selection
            const sourceTracked = sourcePage.tracked;
            const targetTracked = targetPage.tracked;

            // Colors for tracked vs untracked edges (lighter = untracked, won't be published)
            const trackedEdgeColor = '#cbd5e1'; // neutral-300 (darker for tracked - will be published)
            const untrackedEdgeColor = '#e2e8f0'; // neutral-200 (lighter to indicate won't be published)
            const selectedEdgeColor = '#fcd34d'; // warning-300

            // Determine edge color based on tracked status
            const sourceColor = isSelected ? selectedEdgeColor : (sourceTracked ? trackedEdgeColor : untrackedEdgeColor);
            const targetColor = isSelected ? selectedEdgeColor : (targetTracked ? trackedEdgeColor : untrackedEdgeColor);

            // Determine if we need a gradient (different tracked status and not selected)
            const needsGradient = !isSelected && sourceTracked !== targetTracked;
            const gradientId = `edge-gradient-${index}`;

            // Uniform color when both ends have same tracked status
            const structuralColor = edge.bundleEdgeKind === 'collectionMembership' ? '#8b5cf6' : '#60a5fa';
            const uniformStrokeColor = isStructural
              ? structuralColor
              : (isSelected ? selectedEdgeColor : (sourceTracked ? trackedEdgeColor : untrackedEdgeColor));

            // Move the start and end
            const pageRadius = BUNDLE_NODE_RADIUS;
            const dx = targetPos.x - sourcePos.x;
            const dy = targetPos.y - sourcePos.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            let x1 = sourcePos.x;
            let y1 = sourcePos.y;
            let x2 = targetPos.x;
            let y2 = targetPos.y;
            if (len > pageRadius * 2) {
              x1 = sourcePos.x + (dx / len) * pageRadius;
              y1 = sourcePos.y + (dy / len) * pageRadius;
              x2 = targetPos.x - (dx / len) * pageRadius;
              y2 = targetPos.y - (dy / len) * pageRadius;
            }

            // Assuming edge has an isBidirectional property
            const isBidirectional = edge.isBidirectional === true;

            // Choose marker based on tracked status (selected edges use selected markers)
            const endMarkerSuffix = isSelected ? '-selected' : (!targetTracked ? '-untracked' : '');
            const startMarkerSuffix = isSelected ? '-selected' : (!sourceTracked ? '-untracked' : '');

            return (
              <g key={`edge-${index}`} style={{ opacity: visibilityOpacity }}>
                {/* Define color gradient for this edge if needed (fades from tracked to untracked color) */}
                {needsGradient && (
                  <defs>
                    <linearGradient
                      id={gradientId}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={sourceColor} />
                      <stop offset="100%" stopColor={targetColor} />
                    </linearGradient>
                  </defs>
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={!isStructural && needsGradient ? `url(#${gradientId})` : uniformStrokeColor}
                  strokeWidth={isStructural ? 0.8 : 0.5}
                  strokeDasharray={isStructural ? '2,1' : undefined}
                  markerEnd={`url(#arrowhead-end${endMarkerSuffix})`}
                  markerStart={isBidirectional ? `url(#arrowhead-start${startMarkerSuffix})` : undefined}
                />
              </g>
            );
          })}

          {/* Draw pages */}
          {displayGraph.allDisplayNodes.map((page) => {
            if (isBundlePreviewActive) {
              if (!previewBundleNodeKeys.has(page.bundleNodeKey)) return null;
            } else {
              if (!page.isVisible) return null;
            }

            const pagePosition = positions.get(page.bundleNodeKey);
            if (!pagePosition) return null;

            return (
              <g
                key={page.bundleNodeKey}
                data-testid="graph-page-node"
                data-page-id={page.bundleNodeKey}
                transform={`translate(${pagePosition.x},${pagePosition.y})`}
                onClick={() => handlePageClick(page.bundleNodeKey)}
                onContextMenu={(e) => {
                  if (onBundleNodeContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    onBundleNodeContextMenu(page.bundleNodeKey, e.clientX, e.clientY);
                  }
                }}
                onMouseEnter={() => {
                  if (!svgRef.current || !containerRef.current) return;
                  const pt = svgRef.current.createSVGPoint();
                  pt.x = pagePosition.x;
                  pt.y = pagePosition.y;
                  const ctm = svgRef.current.getScreenCTM();
                  const containerRect = containerRef.current.getBoundingClientRect();
                  if (ctm) {
                    const screenPt = pt.matrixTransform(ctm);
                    const isImage = isImageFileType(page.fileType);
                    // Excalidraw drawings live as `<title>.excalidraw.md` on disk;
                    // the hover preview component recognises that URL suffix and
                    // routes it through the vendored Excalidraw renderer instead
                    // of `<img>`.
                    const isExcalidraw = page.fileType === 'excalidraw';
                    const filename = isExcalidraw
                      ? `${page.bundleNodeName}.excalidraw.md`
                      : `${page.bundleNodeName}.${page.fileType}`;
                    const filePath = page.sourceGraphSubdirectory
                      ? `${page.sourceGraphSubdirectory}/${filename}`
                      : filename;
                    setHoveredNode({
                      id: page.bundleNodeKey,
                      x: screenPt.x - containerRect.left,
                      y: screenPt.y - containerRect.top,
                      title: page.bundleNodeName,
                      isImage,
                      imagePath: isImage ? `bundles/${bundleSlug}/generation/source-file/${encodeURIComponent(filePath)}` : undefined,
                      highlights: page.highlights,
                    });
                  }
                }}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                <BundleNodeGlyph
                  isSelected={page.isSelected}
                  isFrontierNode={page.isFrontierNode}
                  isFrontierImageExtension={page.isFrontierImageExtension}
                  tracked={page.tracked}
                  fileType={page.fileType}
                  bundleNodeKind={page.bundleNodeKind}
                  highlights={page.highlights}
                  showLabel={page.showLabel}
                  label={page.label}
                />
              </g>
            );
          })}

          {/* Search result labels - rendered after page circles for correct z-ordering */}
          <GraphSearchLabels
            placements={searchLabelPlacements}
            fontSize={4}
            pageRadius={BUNDLE_NODE_RADIUS}
            connectorMarkerId="label-connector-arrow"
          />

          {/* Selection box rectangle */}
          {selectionBox && (
            <rect
              x={Math.min(selectionBox.startX, selectionBox.currentX)}
              y={Math.min(selectionBox.startY, selectionBox.currentY)}
              width={Math.abs(selectionBox.currentX - selectionBox.startX)}
              height={Math.abs(selectionBox.currentY - selectionBox.startY)}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="#3b82f6"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
    </div>
  );
};
export default GraphVis;
