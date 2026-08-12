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

interface StructuralTreeRowsProps {
  displayGraph: DisplayGraph;
  entrySiteNodeId?: string;
  selectedNodeKeys?: Set<string>;
  onSelectedNodeKeysChange?: (siteNodeKeys: Set<string>) => void;
  onNodeClick: (siteNodeKey: string) => void;
  onNodeContextMenu?: (siteNodeKey: string, x: number, y: number) => void;
}

interface StructuralRow {
  node: DisplayNode;
  depth: number;
  hasChildren: boolean;
}

const kindLabel = (node: DisplayNode): string => node.siteNodeKind === 'collection'
  ? 'Site home'
  : node.siteNodeKind === 'folder' ? 'Folder' : `.${node.fileType}`;

const kindIcon = (node: DisplayNode): string => node.siteNodeKind === 'collection'
  ? '⌂'
  : node.siteNodeKind === 'folder' ? '▣' : '●';

const StructuralTreeRows: React.FC<StructuralTreeRowsProps> = ({
  displayGraph,
  entrySiteNodeId,
  selectedNodeKeys,
  onSelectedNodeKeysChange,
  onNodeClick,
  onNodeContextMenu,
}) => {
  const graph = displayGraph.underlyingGraph;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const data = useMemo(() => {
    const visible = new Set(displayGraph.visibleDisplayNodes.map(node => node.siteNodeKey));
    const children = new Map<string, string[]>();
    for (const edge of graph.getAllEdges()) {
      if (edge.siteEdgeKind === 'semanticLink') continue;
      const values = children.get(edge.source) ?? [];
      if (!values.includes(edge.target)) values.push(edge.target);
      children.set(edge.source, values);
    }
    const entry = graph.getAllNodes().find(node => node.siteNodeId === entrySiteNodeId)
      ?? graph.getAllNodes().find(node => node.siteNodeKind !== 'file' && !graph.getIncomingEdges(node.siteNodeKey).some(edge => edge.siteEdgeKind !== 'semanticLink'));
    const reached = new Set<string>();
    const rows: StructuralRow[] = [];
    const visit = (key: string, depth: number): void => {
      if (reached.has(key)) return;
      reached.add(key);
      const displayNode = displayGraph.getDisplayNode(key);
      const isVisible = Boolean(displayNode && visible.has(key));
      if (isVisible) rows.push({ node: displayNode!, depth, hasChildren: (children.get(key)?.length ?? 0) > 0 });
      if (collapsed.has(key)) return;
      for (const child of children.get(key) ?? []) visit(child, isVisible ? depth + 1 : depth);
    };
    if (entry) visit(entry.siteNodeKey, 0);
    const semanticOnly = displayGraph.visibleDisplayNodes
      .filter(node => !reached.has(node.siteNodeKey))
      .sort((left, right) => left.siteNodeName.localeCompare(right.siteNodeName));
    return { rows, semanticOnly };
  }, [collapsed, displayGraph, entrySiteNodeId, graph]);

  useEffect(() => setCollapsed(new Set()), [entrySiteNodeId, graph]);

  const row = (item: StructuralRow, semanticOnly = false) => {
    const node = item.node;
    const selected = selectedNodeKeys?.has(node.siteNodeKey) === true;
    return (
      <tr
        key={`${semanticOnly ? 'semantic-' : 'structural-'}${node.siteNodeKey}`}
        className={`cursor-pointer hover:bg-gray-50 ${selected ? 'bg-orange-100' : ''}`}
        onClick={() => onNodeClick(node.siteNodeKey)}
        onContextMenu={event => {
          if (!onNodeContextMenu) return;
          event.preventDefault();
          onNodeContextMenu(node.siteNodeKey, event.clientX, event.clientY);
        }}
      >
        <td className="border px-3 py-2">
          {selectedNodeKeys && onSelectedNodeKeysChange && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => {
                const next = new Set(selectedNodeKeys);
                if (selected) next.delete(node.siteNodeKey); else next.add(node.siteNodeKey);
                onSelectedNodeKeysChange(next);
              }}
              onClick={event => event.stopPropagation()}
            />
          )}
        </td>
        <td className="border px-3 py-2" style={{ paddingLeft: `${12 + item.depth * 22}px` }}>
          <span className="inline-flex items-center gap-2">
            {!semanticOnly && item.hasChildren ? (
              <button
                type="button"
                aria-label={`${collapsed.has(node.siteNodeKey) ? 'Expand' : 'Collapse'} ${node.siteNodeName}`}
                onClick={event => {
                  event.stopPropagation();
                  setCollapsed(previous => {
                    const next = new Set(previous);
                    if (next.has(node.siteNodeKey)) next.delete(node.siteNodeKey); else next.add(node.siteNodeKey);
                    return next;
                  });
                }}
                className="w-4 text-gray-500"
              >{collapsed.has(node.siteNodeKey) ? '▸' : '▾'}</button>
            ) : <span className="w-4" />}
            <span aria-label={kindLabel(node)}>{kindIcon(node)}</span>
            <span>{node.siteNodeName}</span>
            {node.tracked && <span className="text-xs text-green-700">Tracked</span>}
            {node.underlyingNode.effectiveBlacklistingSiteNodeId && <span className="text-xs text-red-700">Excluded by folder</span>}
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
      <tr><th colSpan={5} className="border px-3 py-2 text-left bg-gray-100">Selected folder structure</th></tr>
      {data.rows.map(item => row(item))}
      <tr><th colSpan={5} className="border px-3 py-2 text-left bg-gray-100">Semantic-only / outside selected folders</th></tr>
      {data.semanticOnly.length > 0
        ? data.semanticOnly.map(node => row({ node, depth: 0, hasChildren: false }, true))
        : <tr><td colSpan={5} className="border px-3 py-3 text-sm text-gray-500">No semantic-only nodes.</td></tr>}
    </>
  );
};

export default StructuralTreeRows;
