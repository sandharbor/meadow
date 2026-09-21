/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Graph, type IBundleNode } from '../../../../../../../contracts/types/graph';
import ListView from '../../../../../src/areas/bundle/curation/components/ListView';
import { DisplayGraph } from '../../../../../src/areas/bundle/curation/types/displayGraph';

const sourceGraph = () => {
  const graph = new Graph();
  graph.sources = [
    { id: 'source000001', name: 'research', aliases: ['papers'], directory: '/research' },
    { id: 'source000002', name: 'notes', directory: '/notes' },
  ];
  for (const source of graph.sources) {
    graph.addNode({
      bundleNodeKey: `_mw_sources/${source.id}/Same/Overview.md` as IBundleNode['bundleNodeKey'],
      bundleNodeKind: 'file',
      bundleNodeName: 'Overview',
      sourceId: source.id,
      sourceGraphSubdirectory: 'Same',
      fileType: 'md',
      label: 'Overview',
      depth: 0,
      remaining_depth: 0,
      getIdent: () => 'Overview',
    });
  }
  return graph;
};

describe('ListView source column', () => {
  beforeEach(() => sessionStorage.clear());

  it('sorts namesake pages by canonical source name in both directions and layouts', () => {
    const { container } = render(<ListView displayGraph={new DisplayGraph(sourceGraph())} bundleSlug="test" onPageClick={vi.fn()} />);
    const sources = () => [...container.querySelectorAll('tbody tr[data-bundle-node-key]')].map(row => row.children[2].textContent);

    fireEvent.click(screen.getByRole('columnheader', { name: 'Source' }));
    expect(sources()).toEqual(['notes', 'research']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Source/ }));
    expect(sources()).toEqual(['research', 'notes']);
    expect(screen.queryByText('papers')).not.toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Same' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Structure' }));
    const rows = [...container.querySelectorAll('tbody tr[data-bundle-node-key]')];
    expect(rows.map(row => row.children[1].textContent)).toEqual(['research', 'notes']);
    expect(rows.every(row => row.children.length === 5)).toBe(true);
    expect(screen.getByRole('columnheader', { name: 'Outside selected folders' })).toHaveAttribute('colspan', '5');
  });

  it('keeps the column when filtering leaves only one source visible', () => {
    const graph = new DisplayGraph(sourceGraph());
    graph.getDisplayNode('_mw_sources/source000001/Same/Overview.md')!.setVisible(false);
    render(<ListView displayGraph={graph} bundleSlug="test" onPageClick={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'notes' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'research' })).not.toBeInTheDocument();
  });

  it.each([0, 1])('omits the column with %i registered sources in either layout', sourceCount => {
    const graph = sourceGraph();
    graph.sources = graph.sources.slice(0, sourceCount);
    render(<ListView displayGraph={new DisplayGraph(graph)} bundleSlug="test" onPageClick={vi.fn()} />);
    expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
    expect(within(screen.getAllByRole('row')[0]).getAllByRole('columnheader')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Structure' }));
    expect(screen.queryByRole('columnheader', { name: 'Source' })).not.toBeInTheDocument();
    expect(within(screen.getAllByRole('row')[0]).getAllByRole('columnheader')).toHaveLength(4);
  });
});
