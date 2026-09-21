/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { IBundleNode } from '../../../../../contracts/types/IBundleNode.js';
import type { BundleNodeTraversalPathStep } from '../../../../../contracts/types/bundleNodeGraph.js';
import type { Graph } from '../../../../../contracts/types/graph.js';

/** Use the displayed snapshot's registry, including steps absent from its node inventory. */
export function traversalSourceName(graph: Graph, key: string): string | undefined {
  if (graph.sources.length < 2) return undefined;
  const sourceId = graph.getNode(key)?.sourceId
    ?? /^(?:folder:)?\/?_mw_sources\/([a-z0-9]{12})(?:\/|$)/.exec(key)?.[1];
  return graph.sources.find(source => source.id === sourceId)?.name;
}

/** Display summaries only: independent maxima must never become a traversal state. */
export function remainingTraversalDepths(node: IBundleNode) {
  return (node.traversal_states ?? []).reduce((depths, state) => ({
    outlinks: Math.max(depths.outlinks, state.remaining_outlinks_depth),
    inlinks: Math.max(depths.inlinks, state.remaining_inlinks_depth),
  }), { outlinks: node.remaining_depth, inlinks: node.remaining_inlinks_depth ?? 0 });
}

/** Independent display maxima before this node's overrides are applied. */
export function inheritedTraversalDepths(node: IBundleNode) {
  const details = [node.traversal_details, node.traversal_path_steps?.at(-1)?.traversal_details,
    ...(node.traversal_alternative_routes ?? []).map(route => route.at(-1)?.traversal_details)];
  const outlinks = details.flatMap(detail => detail?.outlinks_depth_inherited ?? []);
  const inlinks = details.flatMap(detail => detail?.inlinks_depth_inherited ?? []);
  return {
    outlinks: outlinks.length ? Math.max(...outlinks) : undefined,
    inlinks: inlinks.length ? Math.max(...inlinks) : undefined,
  };
}

export interface ExplainedTraversalRoute {
  path: string[];
  steps?: BundleNodeTraversalPathStep[];
  outlinks: number;
  inlinks: number;
  outlinksBeforeOverride?: number;
  inlinksBeforeOverride?: number;
  retainedForTraversal?: boolean;
  label: string;
}

export function explainedTraversalRoutes(node: IBundleNode): ExplainedTraversalRoute[] {
  const routes = [{ path: node.path ?? [], steps: node.traversal_path_steps,
    outlinks: node.remaining_depth, inlinks: node.remaining_inlinks_depth ?? 0 },
  ...(node.traversal_alternative_routes ?? []).filter(steps => steps.length > 0).map(steps => ({
    path: steps.map(step => step.bundleNodeKey), steps,
    outlinks: steps.at(-1)!.remaining_depth, inlinks: steps.at(-1)!.remaining_inlinks_depth,
  }))].map(route => {
    const details = route.steps?.at(-1)?.traversal_details;
    return { ...route,
      retainedForTraversal: route.steps?.at(-1)?.retainedForTraversal,
      outlinksBeforeOverride: details?.outlinks_depth_overridden !== undefined ? details.outlinks_depth_inherited : undefined,
      inlinksBeforeOverride: details?.inlinks_depth_overridden !== undefined ? details.inlinks_depth_inherited : undefined,
    };
  });
  const maximum = remainingTraversalDepths(node);
  const outlinksVary = new Set(routes.map(route => route.outlinks)).size > 1;
  const inlinksVary = new Set(routes.map(route => route.inlinks)).size > 1;
  const beforeOutlinks = routes.flatMap(route => route.outlinksBeforeOverride ?? []);
  const beforeInlinks = routes.flatMap(route => route.inlinksBeforeOverride ?? []);
  const beforeOutlinksVary = new Set(beforeOutlinks).size > 1;
  const beforeInlinksVary = new Set(beforeInlinks).size > 1;
  const maximumBeforeOutlinks = Math.max(...beforeOutlinks);
  const maximumBeforeInlinks = Math.max(...beforeInlinks);
  return routes.map((route, index) => {
    const labels = [index === 0 ? 'Shortest' : '',
      outlinksVary && route.outlinks === maximum.outlinks ? 'Most outlinks' : '',
      inlinksVary && route.inlinks === maximum.inlinks ? 'Most inlinks' : '',
      beforeOutlinksVary && route.outlinksBeforeOverride === maximumBeforeOutlinks ? 'Most outlinks before override' : '',
      beforeInlinksVary && route.inlinksBeforeOverride === maximumBeforeInlinks ? 'Most inlinks before override' : '',
    ].filter(Boolean);
    return { ...route, label: labels.join(' · ') || 'Alternative' };
  });
}

export function defaultTraversalRoute(routes: ExplainedTraversalRoute[]): number {
  // Prefer an arrival that explains strictly more traversal than the shortest route.
  const stronger = routes.findIndex(route => route.outlinks >= routes[0].outlinks && route.inlinks >= routes[0].inlinks
    && (route.outlinks > routes[0].outlinks || route.inlinks > routes[0].inlinks));
  if (stronger >= 0) return stronger;
  // Equal resulting budgets can hide a stronger arrival that the override reduced.
  const overridden = routes.findIndex(route => route.outlinks === routes[0].outlinks && route.inlinks === routes[0].inlinks
    && (route.outlinksBeforeOverride ?? 0) >= (routes[0].outlinksBeforeOverride ?? 0)
    && (route.inlinksBeforeOverride ?? 0) >= (routes[0].inlinksBeforeOverride ?? 0)
    && ((route.outlinksBeforeOverride ?? 0) > (routes[0].outlinksBeforeOverride ?? 0)
      || (route.inlinksBeforeOverride ?? 0) > (routes[0].inlinksBeforeOverride ?? 0)));
  return overridden < 0 ? 0 : overridden;
}
