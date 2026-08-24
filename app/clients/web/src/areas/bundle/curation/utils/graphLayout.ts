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

import type { IEdge } from '../../../../../../../shared_code/types/graph';
import type { BundleNodeKind } from '../../../../../../../shared_code/types/bundleNodeConfig';
import type { NodePosition } from '../types/graphViewport';

export interface GraphLayoutNode {
  bundleNodeKey: string;
  bundleNodeName: string;
  bundleNodeKind: BundleNodeKind;
  distance: number | undefined;
  isVisible: boolean;
}

export interface GraphLayoutGuide {
  kind: 'section' | 'depth';
  label: string;
  y: number;
}

export interface GraphLayout {
  positions: Map<string, NodePosition>;
  guides: GraphLayoutGuide[];
  isFolderAware: boolean;
}

interface FolderRow {
  kind: 'container' | 'files';
  nodes: GraphLayoutNode[];
  indent: number;
}

interface SemanticRow {
  nodes: GraphLayoutNode[];
  depth: number | undefined;
}

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 200;
const HORIZONTAL_PADDING = 20;
const VERTICAL_PADDING = 20;
const MAX_X_PADDING = 14;
const FOLDER_INDENT = 12;
const MIN_NODE_SPACING = 8;
const DESIRED_ROW_SPACING = 18;
const SEMANTIC_SECTION_GAP_ROWS = 0.75;
const SEMANTIC_NODE_START_X = 36;

function calculateDepthLayout(
  nodes: GraphLayoutNode[],
  includeHidden: boolean,
  width: number,
  height: number,
): GraphLayout {
  const levelMap = new Map<number, GraphLayoutNode[]>();
  const undefinedDistance: GraphLayoutNode[] = [];

  for (const node of nodes) {
    if (!includeHidden && !node.isVisible) continue;
    if (node.distance === undefined) {
      undefinedDistance.push(node);
      continue;
    }
    const level = levelMap.get(node.distance) ?? [];
    level.push(node);
    levelMap.set(node.distance, level);
  }

  const sortedLevels = Array.from(levelMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, levelNodes]) => levelNodes);
  if (undefinedDistance.length > 0) sortedLevels.push(undefinedDistance);

  const availableHeight = height - VERTICAL_PADDING * 2;
  const levelSpacing = sortedLevels.length > 1
    ? availableHeight / (sortedLevels.length - 1)
    : 0;
  const positions = new Map<string, NodePosition>();

  sortedLevels.forEach((levelNodes, levelIndex) => {
    const visible = levelNodes.filter(node => node.isVisible);
    const hidden = levelNodes.filter(node => !node.isVisible);
    const place = (nodesAtLevel: GraphLayoutNode[], y: number): void => {
      const availableWidth = width - HORIZONTAL_PADDING * 2;
      const step = availableWidth / (nodesAtLevel.length + 1);
      nodesAtLevel.forEach((node, index) => {
        positions.set(node.bundleNodeKey, {
          x: HORIZONTAL_PADDING + step * (index + 1),
          y,
        });
      });
    };
    const y = VERTICAL_PADDING + levelSpacing * levelIndex;
    place(visible, y);
    if (includeHidden) place(hidden, y + 10);
  });

  return { positions, guides: [], isFolderAware: false };
}

function chunksForRow(
  nodes: GraphLayoutNode[],
  indent: number,
  width: number,
): GraphLayoutNode[][] {
  const startX = HORIZONTAL_PADDING + indent * FOLDER_INDENT;
  const availableWidth = width - MAX_X_PADDING - startX;
  const maxPerRow = Math.max(1, Math.floor(availableWidth / MIN_NODE_SPACING) + 1);
  const chunks: GraphLayoutNode[][] = [];
  for (let start = 0; start < nodes.length; start += maxPerRow) {
    chunks.push(nodes.slice(start, start + maxPerRow));
  }
  return chunks;
}

function placeIndentedRow(
  positions: Map<string, NodePosition>,
  nodes: GraphLayoutNode[],
  indent: number,
  y: number,
  width: number,
): void {
  const startX = HORIZONTAL_PADDING + indent * FOLDER_INDENT;
  const availableWidth = width - MAX_X_PADDING - startX;
  const step = nodes.length > 1
    ? Math.min(MIN_NODE_SPACING, availableWidth / (nodes.length - 1))
    : 0;
  nodes.forEach((node, index) => {
    positions.set(node.bundleNodeKey, { x: startX + step * index, y });
  });
}

function semanticPredecessorAverage(
  node: GraphLayoutNode,
  semanticEdges: IEdge[],
  positions: Map<string, NodePosition>,
  nodesByKey: Map<string, GraphLayoutNode>,
): number | undefined {
  const xValues: number[] = [];
  for (const edge of semanticEdges) {
    let neighborKey: string | undefined;
    if (edge.source === node.bundleNodeKey) neighborKey = edge.target;
    if (edge.target === node.bundleNodeKey) neighborKey = edge.source;
    if (!neighborKey) continue;
    const neighbor = nodesByKey.get(neighborKey);
    const neighborPosition = positions.get(neighborKey);
    if (!neighbor || !neighborPosition) continue;
    if (node.distance !== undefined && neighbor.distance !== undefined && neighbor.distance >= node.distance) continue;
    xValues.push(neighborPosition.x);
  }
  if (xValues.length === 0) return undefined;
  return xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
}

function orderSemanticRow(
  row: SemanticRow,
  semanticEdges: IEdge[],
  positions: Map<string, NodePosition>,
  nodesByKey: Map<string, GraphLayoutNode>,
): GraphLayoutNode[] {
  return [...row.nodes].sort((left, right) => {
    const leftAverage = semanticPredecessorAverage(left, semanticEdges, positions, nodesByKey);
    const rightAverage = semanticPredecessorAverage(right, semanticEdges, positions, nodesByKey);
    if (leftAverage !== undefined && rightAverage !== undefined && leftAverage !== rightAverage) {
      return leftAverage - rightAverage;
    }
    if (leftAverage !== undefined && rightAverage === undefined) return -1;
    if (leftAverage === undefined && rightAverage !== undefined) return 1;
    return left.bundleNodeName.localeCompare(right.bundleNodeName)
      || left.bundleNodeKey.localeCompare(right.bundleNodeKey);
  });
}

function semanticChunks(nodes: GraphLayoutNode[], width: number): GraphLayoutNode[][] {
  const availableWidth = width - SEMANTIC_NODE_START_X - MAX_X_PADDING;
  // placeSemanticRow leaves a half-step gutter at both ends, so reserve those
  // two slots when calculating how many node diameters fit without overlap.
  const maxPerRow = Math.max(1, Math.floor(availableWidth / MIN_NODE_SPACING) - 1);
  const chunks: GraphLayoutNode[][] = [];
  for (let start = 0; start < nodes.length; start += maxPerRow) {
    chunks.push(nodes.slice(start, start + maxPerRow));
  }
  return chunks;
}

function placeSemanticRow(
  positions: Map<string, NodePosition>,
  nodes: GraphLayoutNode[],
  y: number,
  width: number,
): void {
  const availableWidth = width - SEMANTIC_NODE_START_X - MAX_X_PADDING;
  const step = availableWidth / (nodes.length + 1);
  nodes.forEach((node, index) => {
    positions.set(node.bundleNodeKey, {
      x: SEMANTIC_NODE_START_X + step * (index + 1),
      y,
    });
  });
}

export function calculateGraphLayout(
  nodes: GraphLayoutNode[],
  edges: IEdge[],
  includeHidden = false,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): GraphLayout {
  const structuralEdges = edges.filter(edge => edge.bundleEdgeKind !== 'semanticLink');
  const hasStructuralContainers = nodes.some(node => node.bundleNodeKind !== 'file');
  if (structuralEdges.length === 0 || !hasStructuralContainers) {
    return calculateDepthLayout(nodes, includeHidden, width, height);
  }

  const nodesByKey = new Map(nodes.map(node => [node.bundleNodeKey, node]));
  const structuralChildren = new Map<string, string[]>();
  const incomingStructural = new Set<string>();
  for (const edge of structuralEdges) {
    const children = structuralChildren.get(edge.source) ?? [];
    if (!children.includes(edge.target)) children.push(edge.target);
    structuralChildren.set(edge.source, children);
    incomingStructural.add(edge.target);
  }

  const roots = nodes.filter(node =>
    node.bundleNodeKind !== 'file' && !incomingStructural.has(node.bundleNodeKey)
  );
  const folderRows: FolderRow[] = [];
  const structurallyPlaced = new Set<string>();

  const visitContainer = (node: GraphLayoutNode, indent: number): void => {
    if (structurallyPlaced.has(node.bundleNodeKey)) return;
    structurallyPlaced.add(node.bundleNodeKey);
    folderRows.push({ kind: 'container', nodes: [node], indent });

    const children = (structuralChildren.get(node.bundleNodeKey) ?? [])
      .map(key => nodesByKey.get(key))
      .filter((child): child is GraphLayoutNode => Boolean(child));
    const directFiles = children.filter(child => child.bundleNodeKind === 'file');
    for (const file of directFiles) structurallyPlaced.add(file.bundleNodeKey);
    for (const chunk of chunksForRow(directFiles, indent + 1, width)) {
      folderRows.push({ kind: 'files', nodes: chunk, indent: indent + 1 });
    }
    for (const child of children) {
      if (child.bundleNodeKind !== 'file') visitContainer(child, indent + 1);
    }
  };

  for (const root of roots) visitContainer(root, 0);
  // Defensive fallback for malformed/disconnected structural components.
  for (const node of nodes) {
    if (node.bundleNodeKind !== 'file' && !structurallyPlaced.has(node.bundleNodeKey)) {
      visitContainer(node, 0);
    }
  }

  const semanticNodes = nodes.filter(node =>
    !structurallyPlaced.has(node.bundleNodeKey) && (includeHidden || node.isVisible)
  );
  const semanticLevelMap = new Map<number, GraphLayoutNode[]>();
  const undefinedDistance: GraphLayoutNode[] = [];
  for (const node of semanticNodes) {
    if (node.distance === undefined) {
      undefinedDistance.push(node);
      continue;
    }
    const level = semanticLevelMap.get(node.distance) ?? [];
    level.push(node);
    semanticLevelMap.set(node.distance, level);
  }
  const semanticRows: SemanticRow[] = Array.from(semanticLevelMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([depth, levelNodes]) => ({ nodes: levelNodes, depth }));
  if (undefinedDistance.length > 0) {
    semanticRows.push({ nodes: undefinedDistance, depth: undefined });
  }

  const semanticPhysicalRowCount = semanticRows.reduce(
    (total, row) => total + semanticChunks(row.nodes, width).length,
    0,
  );

  const semanticStartUnit = folderRows.length > 0
    ? folderRows.length - 1 + 1 + SEMANTIC_SECTION_GAP_ROWS
    : 0;
  const lastUnit = semanticPhysicalRowCount > 0
    ? semanticStartUnit + semanticPhysicalRowCount - 1
    : Math.max(0, folderRows.length - 1);
  const availableHeight = height - VERTICAL_PADDING - 15;
  const rowSpacing = lastUnit > 0
    ? Math.min(DESIRED_ROW_SPACING, availableHeight / lastUnit)
    : DESIRED_ROW_SPACING;
  const yForUnit = (unit: number): number => VERTICAL_PADDING + unit * rowSpacing;
  const positions = new Map<string, NodePosition>();

  folderRows.forEach((row, index) => {
    placeIndentedRow(positions, row.nodes, row.indent, yForUnit(index), width);
  });

  const semanticEdges = edges.filter(edge => edge.bundleEdgeKind === 'semanticLink');
  const semanticRowStartUnits: number[] = [];
  let semanticRowOffset = 0;
  for (const row of semanticRows) {
    semanticRowStartUnits.push(semanticStartUnit + semanticRowOffset);
    const ordered = orderSemanticRow(row, semanticEdges, positions, nodesByKey);
    const chunks = semanticChunks(ordered, width);
    chunks.forEach((chunk, chunkIndex) => {
      placeSemanticRow(
        positions,
        chunk,
        yForUnit(semanticStartUnit + semanticRowOffset + chunkIndex),
        width,
      );
    });
    semanticRowOffset += chunks.length;
  }

  const guides: GraphLayoutGuide[] = [];
  if (folderRows.length > 0) {
    guides.push({ kind: 'section', label: 'Selected folders', y: 9 });
  }
  if (semanticRows.length > 0) {
    const firstSemanticY = yForUnit(semanticStartUnit);
    guides.push({
      kind: 'section',
      label: 'Linked pages',
      y: firstSemanticY - rowSpacing * 0.55,
    });
    semanticRows.forEach((row, index) => {
      const label = row.depth === 0
        ? 'Additional roots'
        : row.depth === undefined ? 'Other' : `Depth ${row.depth}`;
      guides.push({
        kind: 'depth',
        label,
        y: yForUnit(semanticRowStartUnits[index]),
      });
    });
  }

  return { positions, guides, isFolderAware: true };
}
