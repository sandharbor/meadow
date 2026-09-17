/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Graph } from '../../../../contracts/types/graph.js';
import type { IBundleNode } from '../../../../contracts/types/IBundleNode.js';
import type { BundleNodeTraversalPathStep } from '../../../../contracts/types/bundleNodeGraph.js';
import TraversalPathDetailsModal from '../../src/shared/components/TraversalPathDetailsModal.js';
import BundleNodeSelectionSidebar from '../../src/areas/bundle/curation/components/BundleNodeSelectionSidebar.js';
import { explainedTraversalRoutes, remainingTraversalDepths } from '../../src/shared/utils/traversalRoutes.js';

function step(name: string, depth: number, outlinks: number, inlinks: number, via: 'start' | 'inlink' | 'outlink' = 'outlink'): BundleNodeTraversalPathStep {
  return { bundleNodeKey: `${name}.md`, depth, remaining_depth: outlinks, remaining_inlinks_depth: inlinks,
    retainedForTraversal: true,
    traversal_details: { link_type: via } };
}
function fixture() {
  const graph = new Graph();
  const start = step('Start', 0, 3, 1, 'start');
  const override = { ...step('Taxonomy', 1, 3, 2), traversal_details: { link_type: 'outlink' as const,
    outlinks_depth_inherited: 2, outlinks_depth_overridden: 3, inlinks_depth_inherited: 0, inlinks_depth_overridden: 2 } };
  const direct = [start, step('Hub', 1, 2, 0)];
  direct[1].retainedForTraversal = false;
  const longer = [start, override, step('Hub', 2, 2, 1)];
  for (const route of [[start], [start, override], direct]) {
    const last = route.at(-1)!;
    graph.addNode({ ...last, bundleNodeKey: last.bundleNodeKey as IBundleNode['bundleNodeKey'],
      bundleNodeKind: 'file', bundleNodeName: last.bundleNodeKey.slice(0, -3), fileType: 'md', sourceGraphSubdirectory: '',
      label: last.bundleNodeKey, path: route.map(s => s.bundleNodeKey), traversal_path_steps: route,
      getIdent: () => last.bundleNodeKey });
  }
  graph.addEdge({ source: 'Start.md', target: 'Hub.md', bundleEdgeKind: 'semanticLink' });
  graph.addEdge({ source: 'Start.md', target: 'Taxonomy.md', bundleEdgeKind: 'semanticLink' });
  graph.addEdge({ source: 'Taxonomy.md', target: 'Hub.md', bundleEdgeKind: 'semanticLink' });
  const node = graph.getNode('Hub.md')!;
  node.traversal_states = [{ remaining_outlinks_depth: 2, remaining_inlinks_depth: 1 }];
  node.traversal_alternative_routes = [longer];
  return { graph, node };
}

function applyZeroInlinkOverride(node: IBundleNode) {
  node.conf = { bundleNodeKind: 'file', bundleNodeId: 'a1b2c3d4e5f6', bundleNodeName: 'Hub',
    fileType: 'md', sourceGraphSubdirectory: '', listType: 'whitelist', inlinksDepth: 0 } as IBundleNode['conf'];
  for (const route of [node.traversal_path_steps!, ...node.traversal_alternative_routes!]) {
    const arrival = route.at(-1)!;
    arrival.traversal_details = { ...arrival.traversal_details,
      inlinks_depth_inherited: arrival.remaining_inlinks_depth, inlinks_depth_overridden: 0 };
    arrival.remaining_inlinks_depth = 0;
  }
  node.traversal_details = node.traversal_path_steps!.at(-1)!.traversal_details;
  node.traversal_path_steps!.at(-1)!.retainedForTraversal = true;
  node.traversal_alternative_routes![0].at(-1)!.retainedForTraversal = false;
  node.traversal_states = [{ remaining_outlinks_depth: 2, remaining_inlinks_depth: 0 }];
}

describe('traversal arrivals', () => {
  it('shows the useful longer arrival and lets the reader inspect the shortest independently', () => {
    // Given the shortest route has no incoming budget, but an override on another branch supplies one.
    const { graph, node } = fixture();
    render(<TraversalPathDetailsModal isOpen selectedNode={node} graph={graph} onClose={vi.fn()} />);
    const modal = screen.getByRole('dialog', { name: 'Traversal Path' });
    const diagram = within(modal).getByRole('group', { name: 'Traversal routes' });
    const longer = within(diagram).getByRole('button', { name: 'Most inlinks: outlinks 2, inlinks 1' });
    expect(longer).toHaveAttribute('aria-pressed', 'true');
    expect(within(longer).getByText('Used for traversal')).toBeInTheDocument();
    expect(within(within(diagram).getByRole('button', { name: 'Shortest: outlinks 2, inlinks 0' })).getByText('Explanation only')).toBeInTheDocument();
    expect(within(modal).getByText('depth 2')).toBeInTheDocument();
    const overrideCard = within(modal).getByRole('heading', { name: 'Taxonomy' }).parentElement!.parentElement!;
    expect(within(overrideCard).getAllByText('override')).toHaveLength(2);
    // When choosing the shortest arrival, the familiar step cards show only that route and its 2/0 pair.
    fireEvent.click(within(diagram).getByRole('button', { name: 'Shortest: outlinks 2, inlinks 0' }));
    expect(within(modal).queryByText('depth 2')).not.toBeInTheDocument();
    expect(within(modal).queryByRole('heading', { name: 'Taxonomy' })).not.toBeInTheDocument();
    const hub = within(modal).getByRole('heading', { name: 'Hub' }).parentElement!.parentElement!;
    expect(within(within(hub).getByText('inlinks').parentElement!).getByText('remaining').parentElement).toHaveTextContent('remaining0');
    // Choosing an intermediate node selects the whole longer route and its override evidence.
    fireEvent.click(within(diagram).getByRole('button', { name: 'Route through Taxonomy' }));
    expect(longer).toHaveAttribute('aria-pressed', 'true');
    expect(within(modal).getByText('depth 2')).toBeInTheDocument();
    expect(within(modal).getByRole('heading', { name: 'Taxonomy' })).toBeInTheDocument();
    // A shared node keeps the selected route instead of unexpectedly switching branches.
    fireEvent.click(within(diagram).getByRole('button', { name: 'Route through Start' }));
    expect(longer).toHaveAttribute('aria-pressed', 'true');
    expect(within(modal).getByText('depth 2')).toBeInTheDocument();
  });

  it('explains the stronger inherited budget even when a zero override makes both routes end equally', () => {
    // Given the longer route brings inlink depth 1, but Hub now overrides every arrival to 0.
    const { graph, node } = fixture();
    applyZeroInlinkOverride(node);
    // When opening the modal, default to the route that explains what the override removes.
    render(<TraversalPathDetailsModal isOpen selectedNode={node} graph={graph} onClose={vi.fn()} />);
    const modal = screen.getByRole('dialog', { name: 'Traversal Path' });
    const diagram = within(modal).getByRole('group', { name: 'Traversal routes' });
    expect(within(diagram).getByRole('button', { name: 'Most inlinks before override: outlinks 2, inlinks 0' }))
      .toHaveAttribute('aria-pressed', 'true');
    // Equal numeric budgets do not make the explanatory route a retained traversal route.
    expect(within(within(diagram).getByRole('button', { name: 'Most inlinks before override: outlinks 2, inlinks 0' })).getByText('Explanation only')).toBeInTheDocument();
    expect(within(within(diagram).getByRole('button', { name: 'Shortest: outlinks 2, inlinks 0' })).getByText('Used for traversal')).toBeInTheDocument();
    const hub = within(modal).getByRole('heading', { name: 'Hub' }).parentElement!.parentElement!;
    expect(within(hub).getByText('inlinks').parentElement).toHaveTextContent('override1→0');
    expect(remainingTraversalDepths(node)).toEqual({ outlinks: 2, inlinks: 0 });
    // The direct route still truthfully shows its separate 0 -> 0 override.
    fireEvent.click(within(diagram).getByRole('button', { name: 'Shortest: outlinks 2, inlinks 0' }));
    const directHub = within(modal).getByRole('heading', { name: 'Hub' }).parentElement!.parentElement!;
    expect(within(directHub).getByText('inlinks').parentElement).toHaveTextContent('override0→0');
  });

  it('summarizes independent maxima while retaining intermediate tradeoffs and distinct routes', () => {
    const { node } = fixture();
    node.remaining_depth = 5;
    node.remaining_inlinks_depth = 0;
    node.traversal_states = [
      { remaining_outlinks_depth: 5, remaining_inlinks_depth: 0 },
      { remaining_outlinks_depth: 3, remaining_inlinks_depth: 2 },
      { remaining_outlinks_depth: 1, remaining_inlinks_depth: 4 },
    ];
    node.traversal_alternative_routes = [[step('Balanced', 0, 4, 3, 'start'), step('Hub', 1, 3, 2)],
      [step('Incoming', 0, 2, 5, 'start'), step('Hub', 1, 1, 4)]];
    expect(remainingTraversalDepths(node)).toEqual({ outlinks: 5, inlinks: 4 });
    expect(explainedTraversalRoutes(node).map(route => [route.label, route.outlinks, route.inlinks]))
      .toEqual([['Shortest · Most outlinks', 5, 0], ['Alternative', 3, 2], ['Most inlinks', 1, 4]]);
    expect(explainedTraversalRoutes(node).slice(1).every(route => route.retainedForTraversal)).toBe(true);
  });

  it('does not guess which route was retained when older snapshots omit that evidence', () => {
    const { graph, node } = fixture();
    for (const route of [node.traversal_path_steps!, ...node.traversal_alternative_routes!]) {
      for (const arrival of route) delete arrival.retainedForTraversal;
    }
    render(<TraversalPathDetailsModal isOpen selectedNode={node} graph={graph} onClose={vi.fn()} />);
    const diagram = screen.getByRole('group', { name: 'Traversal routes' });
    expect(within(diagram).queryByText('Used for traversal')).not.toBeInTheDocument();
    expect(within(diagram).queryByText('Explanation only')).not.toBeInTheDocument();
  });

  it.each([false, true])('shows maximum remaining or pre-override depths in the sidebar (zero override: %s)', (zeroOverride) => {
    const { graph, node } = fixture();
    if (zeroOverride) applyZeroInlinkOverride(node);
    render(<BundleNodeSelectionSidebar graph={graph} selectedNodeKeys={new Set(['Hub.md'])}
      onClose={vi.fn()} onSelectedNodeKeysChange={vi.fn()} onTrackPage={vi.fn()} onBlacklistPage={vi.fn()}
      onTrackSelected={vi.fn()} onBlacklistSelected={vi.fn()} isEffectivelySensitive={() => false}
      onUpdatePageConfig={vi.fn()} onDeletePageConfigKey={vi.fn()} onPreviewPage={vi.fn()}
      hasDraftChanges={false} obsidianInfo={null} />);
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Inlink Depth').parentElement).toHaveTextContent(zeroOverride ? 'Inlink Depthoverride1→0' : 'Inlink Depth1');
    expect(screen.getByText('Outlink Depth').parentElement).toHaveTextContent('Outlink Depth2');
    expect(node.path).toEqual(['Start.md', 'Hub.md']);
    expect(node.remaining_inlinks_depth).toBe(0);
  });
});
