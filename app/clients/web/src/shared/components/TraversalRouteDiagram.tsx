/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import React from 'react';
import type { Graph } from '../../../../../contracts/types/graph.js';
import type { ExplainedTraversalRoute } from '../utils/traversalRoutes.js';
import { traversalSourceName } from '../utils/traversalRoutes.js';
import { traversalLinkType } from '../utils/traversalLinkType.js';

interface Branch {
  id: number;
  key: string;
  title: string;
  sourceName?: string;
  parent?: Branch;
  children: Branch[];
  routes: number[];
  endpoint?: number;
  level: number;
  x: number;
  outlinks?: number;
  inlinks?: number;
  overridden: boolean;
  via: string;
}

/** Share identical arrival prefixes only. Merging by page would invent routes and budgets. */
function branchesFor(routes: ExplainedTraversalRoute[], graph: Graph) {
  const branches: Branch[] = [];
  const prefixes = new Map<string, Branch>();
  routes.forEach((route, routeIndex) => {
    let parent: Branch | undefined;
    route.path.forEach((key, level) => {
      const step = route.steps?.[level];
      const signature = JSON.stringify([parent?.id, key, step]);
      let branch = prefixes.get(signature);
      if (!branch) {
        branch = { id: branches.length, key, title: graph.getNode(key)?.bundleNodeName ?? key.split('/').pop()!,
          sourceName: traversalSourceName(graph, key),
          parent, children: [], routes: [], level, x: 0,
          outlinks: step?.remaining_depth, inlinks: step?.remaining_inlinks_depth,
          overridden: step?.traversal_details?.outlinks_depth_overridden !== undefined || step?.traversal_details?.inlinks_depth_overridden !== undefined,
          via: step?.traversal_details?.link_type && step.traversal_details.link_type !== 'start'
            ? step.traversal_details.link_type : traversalLinkType(graph, route.path[level - 1], key),
        };
        prefixes.set(signature, branch);
        branches.push(branch);
        parent?.children.push(branch);
      }
      branch.routes.push(routeIndex);
      if (level === route.path.length - 1) branch.endpoint = routeIndex;
      parent = branch;
    });
  });
  let columns = 0;
  const position = (branch: Branch): number => {
    branch.x = branch.children.length
      ? branch.children.map(position).reduce((sum, x) => sum + x, 0) / branch.children.length
      : columns++;
    return branch.x;
  };
  branches.filter(branch => !branch.parent).forEach(position);
  return { branches, columns };
}

export default function TraversalRouteDiagram({ routes, graph, selected, onSelect, addedNodeKeys }: {
  routes: ExplainedTraversalRoute[]; graph: Graph; selected: number; onSelect: (index: number) => void;
  addedNodeKeys?: ReadonlySet<string>;
}) {
  const markerId = React.useId().replace(/:/g, '');
  const { branches, columns } = branchesFor(routes, graph);
  const nodeHeight = graph.sources.length > 1 ? 116 : 96, rowHeight = nodeHeight + 48;
  const width = Math.max(columns, 1) * 252;
  const height = Math.max(...branches.map(branch => branch.level)) * rowHeight + nodeHeight + 10;
  return <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
    <p className="mb-3 text-xs text-neutral-600">Select a node to see its route.</p>
    <div className="max-h-[26rem] overflow-auto" role="group" aria-label="Traversal routes">
      <div className="relative mx-auto" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height} aria-hidden="true">
          <defs>{[true, false].map(active => <marker key={String(active)} id={`${markerId}-${active}`}
            markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" fill={active ? '#0284c7' : '#cbd5e1'} />
          </marker>)}</defs>
          {branches.filter(branch => branch.parent).map(branch => {
            const parent = branch.parent!;
            const x1 = parent.x * 252 + 126, y1 = parent.level * rowHeight + nodeHeight + 7;
            const x2 = branch.x * 252 + 126, y2 = branch.level * rowHeight;
            const marker = `url(#${markerId}-${branch.routes.includes(selected)})`;
            return <path key={branch.id} d={`M${x1},${y1} L${x1},${y1 + 12} C${x1},${y1 + 18} ${x2},${y2 - 18} ${x2},${y2 - 12} L${x2},${y2}`}
              fill="none" stroke={branch.routes.includes(selected) ? '#0284c7' : '#cbd5e1'} strokeWidth="2"
              markerEnd={branch.via !== 'inlink' ? marker : undefined}
              markerStart={branch.via === 'inlink' || branch.via === 'bidirectional' ? marker : undefined} />;
          })}
        </svg>
        {branches.map(branch => {
          const route = branch.endpoint === undefined ? undefined : routes[branch.endpoint];
          const active = branch.routes.includes(selected);
          const usageExplanation = route?.retainedForTraversal === undefined ? undefined : route.retainedForTraversal
            ? 'This route supplies budgets used for traversal. Other routes may also supply useful budgets; they are kept separately.'
            : 'This route explains how the page was reached or what an override replaced. Its budgets do not add traversal beyond the retained routes.';
          const usageHelpId = `${markerId}-usage-${branch.id}`;
          const content = <>
            <div className="line-clamp-2 text-center font-medium leading-tight" title={branch.key}>{branch.title}</div>
            {branch.sourceName && <div className="mt-1 max-w-full truncate text-[11px] text-neutral-500" title={branch.sourceName}>
              Source: {branch.sourceName}
            </div>}
            {branch.outlinks !== undefined && <div className="mt-1 flex justify-center gap-3 text-[11px]">
              <span className="text-sky-700">out {branch.outlinks}</span><span className="text-amber-700">in {branch.inlinks}</span>
              {branch.overridden && <span className="text-violet-700">override</span>}
              {addedNodeKeys?.has(branch.key) && <span className="text-emerald-700" title="Newly included in the candidate snapshot">Added</span>}
            </div>}
            {route && <div className="mt-1 text-[10px] font-semibold text-neutral-600">{route.label}</div>}
            {route?.retainedForTraversal !== undefined && <span
              className={`group/usage mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ${route.retainedForTraversal ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
              <span>{route.retainedForTraversal ? 'Used for traversal' : 'Explanation only'}</span>
              <span aria-hidden="true" className={`inline-flex h-3 w-3 items-center justify-center rounded-full border text-[9px] leading-none ${route.retainedForTraversal ? 'border-emerald-600' : 'border-neutral-400'}`}>?</span>
              <span id={usageHelpId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] -ml-2 w-64 max-w-[calc(100vw-3rem)] -translate-x-full rounded border border-neutral-200 bg-white p-3 text-left text-xs font-normal text-neutral-700 opacity-0 shadow-lg group-hover/usage:visible group-hover/usage:opacity-100 group-focus-visible/route:visible group-focus-visible/route:opacity-100">
                {usageExplanation}
              </span>
            </span>}
          </>;
          const className = `absolute flex w-[236px] flex-col items-center justify-center rounded-lg border px-2 text-center text-xs ${active ? 'border-sky-400 bg-sky-50' : 'border-neutral-300 bg-white'}`;
          const style = { left: branch.x * 252 + 8, top: branch.level * rowHeight + 4, height: nodeHeight };
          return <button key={branch.id} type="button" className={`${className} group/route hover:border-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600`}
            style={style} aria-pressed={active}
            aria-label={`${route ? `${route.label}: outlinks ${route.outlinks}, inlinks ${route.inlinks}` : `Route through ${branch.title}`}${branch.sourceName ? ` (source: ${branch.sourceName})` : ''}`}
            aria-describedby={route?.retainedForTraversal !== undefined ? usageHelpId : undefined}
            onClick={() => onSelect(active ? selected : branch.routes[0])}>{content}</button>;
        })}
      </div>
    </div>
  </div>;
}
