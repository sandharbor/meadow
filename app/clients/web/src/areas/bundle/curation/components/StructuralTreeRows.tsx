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

import React, { useEffect, useMemo, useState } from 'react';
import type { DisplayGraph, DisplayNode } from '../types/displayGraph';
import ListNodeGlyph from './ListNodeGlyph';

interface StructuralTreeRowsProps {
  displayGraph: DisplayGraph;
  entryBundleNodeId?: string;
  selectedNodeKeys?: Set<string>;
  compareNodes: (left: DisplayNode, right: DisplayNode) => number;
  onNodeClick: (bundleNodeKey: string) => void;
  onNodeContextMenu?: (bundleNodeKey: string, x: number, y: number) => void;
  onGlyphMouseEnter?: (event: React.MouseEvent<SVGSVGElement>, node: DisplayNode) => void;
  onGlyphMouseLeave?: () => void;
  renderInlineThumbnail?: (node: DisplayNode) => React.ReactNode;
}

interface StructuralRow {
  node: DisplayNode;
  depth: number;
  hasChildren: boolean;
}

const kindLabel = (node: DisplayNode): string => node.bundleNodeKind === 'collection'
  ? 'Bundle home'
  : node.bundleNodeKind === 'folder' ? 'Folder' : `.${node.fileType}`;

const StructuralTreeRows: React.FC<StructuralTreeRowsProps> = ({
  displayGraph,
  entryBundleNodeId,
  selectedNodeKeys,
  compareNodes,
  onNodeClick,
  onNodeContextMenu,
  onGlyphMouseEnter,
  onGlyphMouseLeave,
  renderInlineThumbnail,
}) => {
  const graph = displayGraph.underlyingGraph;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const data = useMemo(() => {
    const visible = new Set(displayGraph.visibleDisplayNodes.map(node => node.bundleNodeKey));
    const children = new Map<string, string[]>();
    for (const edge of graph.getAllEdges()) {
      if (edge.bundleEdgeKind === 'semanticLink') continue;
      const values = children.get(edge.source) ?? [];
      if (!values.includes(edge.target)) values.push(edge.target);
      children.set(edge.source, values);
    }
    const entry = graph.getAllNodes().find(node => node.bundleNodeId === entryBundleNodeId)
      ?? graph.getAllNodes().find(node => node.bundleNodeKind !== 'file' && !graph.getIncomingEdges(node.bundleNodeKey).some(edge => edge.bundleEdgeKind !== 'semanticLink'));
    const structurallyReached = new Set<string>();
    const collectStructuralDescendants = (key: string): void => {
      if (structurallyReached.has(key)) return;
      structurallyReached.add(key);
      for (const child of children.get(key) ?? []) collectStructuralDescendants(child);
    };
    const rows: StructuralRow[] = [];
    const rendered = new Set<string>();
    const visit = (key: string, depth: number): void => {
      if (rendered.has(key)) return;
      rendered.add(key);
      const displayNode = displayGraph.getDisplayNode(key);
      const isVisible = Boolean(displayNode && visible.has(key));
      if (isVisible) rows.push({ node: displayNode!, depth, hasChildren: (children.get(key)?.length ?? 0) > 0 });
      if (collapsed.has(key)) return;
      const orderedChildren = [...(children.get(key) ?? [])].sort((leftKey, rightKey) => {
        const left = displayGraph.getDisplayNode(leftKey);
        const right = displayGraph.getDisplayNode(rightKey);
        if (!left || !right) return leftKey.localeCompare(rightKey);
        return compareNodes(left, right);
      });
      for (const child of orderedChildren) visit(child, isVisible ? depth + 1 : depth);
    };
    if (entry) {
      collectStructuralDescendants(entry.bundleNodeKey);
      visit(entry.bundleNodeKey, 0);
    }
    const semanticOnly = displayGraph.visibleDisplayNodes
      .filter(node => !structurallyReached.has(node.bundleNodeKey))
      .sort(compareNodes);
    return { rows, semanticOnly };
  }, [collapsed, compareNodes, displayGraph, entryBundleNodeId, graph]);

  useEffect(() => setCollapsed(new Set()), [entryBundleNodeId, graph]);

  const row = (item: StructuralRow, semanticOnly = false) => {
    const node = item.node;
    const selected = selectedNodeKeys?.has(node.bundleNodeKey) === true;
    return (
      <tr
        key={`${semanticOnly ? 'semantic-' : 'structural-'}${node.bundleNodeKey}`}
        data-bundle-node-key={node.bundleNodeKey}
        data-bundle-node-name={node.bundleNodeName}
        data-structure-section={semanticOnly ? 'outside' : 'selected-folders'}
        className={`cursor-pointer hover:bg-gray-50 ${selected ? 'bg-orange-100' : ''}`}
        onClick={() => onNodeClick(node.bundleNodeKey)}
        onContextMenu={event => {
          if (!onNodeContextMenu) return;
          event.preventDefault();
          onNodeContextMenu(node.bundleNodeKey, event.clientX, event.clientY);
        }}
      >
        <td className="border px-3 py-2" style={{ paddingLeft: `${12 + item.depth * 22}px` }}>
          <span className="inline-flex items-center gap-2">
            {!semanticOnly && item.hasChildren ? (
              <button
                type="button"
                aria-label={`${collapsed.has(node.bundleNodeKey) ? 'Expand' : 'Collapse'} ${node.bundleNodeName}`}
                onClick={event => {
                  event.stopPropagation();
                  setCollapsed(previous => {
                    const next = new Set(previous);
                    if (next.has(node.bundleNodeKey)) next.delete(node.bundleNodeKey); else next.add(node.bundleNodeKey);
                    return next;
                  });
                }}
                className="w-4 text-gray-500"
              >{collapsed.has(node.bundleNodeKey) ? '▸' : '▾'}</button>
            ) : <span className="w-4" />}
            <ListNodeGlyph
              node={node}
              onMouseEnter={event => onGlyphMouseEnter?.(event, node)}
              onMouseLeave={onGlyphMouseLeave}
            />
            <span>{node.bundleNodeName}</span>
            {node.bundleNodeKind === 'file' && renderInlineThumbnail?.(node)}
            {node.underlyingNode.effectiveBlacklistingBundleNodeId && <span className="text-xs text-red-700">Excluded by folder</span>}
          </span>
        </td>
        <td className="border px-3 py-2 text-neutral-500">{node.sourceGraphSubdirectory}</td>
        <td className="border px-3 py-2 text-neutral-500 font-mono text-sm">{kindLabel(node)}</td>
        <td className="border px-3 py-2">{node.distance ?? 'N/A'}</td>
      </tr>
    );
  };

  return (
    <>
      <tr><th colSpan={4} className="border px-3 py-2 text-left bg-gray-100">Selected folder structure</th></tr>
      {data.rows.map(item => row(item))}
      <tr><th colSpan={4} className="border px-3 py-2 text-left bg-gray-100">Outside selected folders</th></tr>
      {data.semanticOnly.length > 0
        ? data.semanticOnly.map(node => row({ node, depth: 0, hasChildren: false }, true))
        : <tr><td colSpan={4} className="border px-3 py-3 text-sm text-gray-500">No nodes outside selected folders.</td></tr>}
    </>
  );
};

export default StructuralTreeRows;
