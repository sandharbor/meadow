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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import StructuralTreeRows from '../../../../../src/areas/bundle/curation/components/StructuralTreeRows';
import { compareListNodes } from '../../../../../src/areas/bundle/curation/components/ListView';
import { DisplayGraph } from '../../../../../src/areas/bundle/curation/types/displayGraph';

const node = (
  bundleNodeKey: string,
  bundleNodeName: string,
  bundleNodeKind: 'file' | 'folder',
  sourceGraphSubdirectory: string,
): IBundleNode => ({
  bundleNodeKey: bundleNodeKey as IBundleNode['bundleNodeKey'],
  bundleNodeId: bundleNodeKey as IBundleNode['bundleNodeId'],
  bundleNodeName,
  bundleNodeKind,
  sourceGraphSubdirectory,
  ...(bundleNodeKind === 'file' ? { fileType: 'md' as const } : {}),
  label: bundleNodeName,
  depth: 0,
  remaining_depth: 0,
  getIdent: () => bundleNodeName,
} as IBundleNode);

describe('StructuralTreeRows', () => {
  const compareByTitle = (left: DisplayGraph['visibleDisplayNodes'][number], right: DisplayGraph['visibleDisplayNodes'][number]) => (
    compareListNodes(left, right, 'title', 'asc')
  );

  it('keeps collapsed descendants out of the outside-selected-folders section', () => {
    const graph = new Graph();
    graph.addNode(node('alpha', 'Alpha', 'folder', 'Alpha'));
    graph.addNode(node('alpha-note', 'Alpha note', 'file', 'Alpha'));
    graph.addNode(node('outside-note', 'Outside note', 'file', 'Outside'));
    graph.addEdge({ source: 'alpha', target: 'alpha-note', bundleEdgeKind: 'directoryContainment' });
    graph.addEdge({ source: 'alpha-note', target: 'outside-note', bundleEdgeKind: 'semanticLink' });

    render(
      <table><tbody><StructuralTreeRows
        displayGraph={new DisplayGraph(graph)}
        entryBundleNodeId={'alpha' as IBundleNode['bundleNodeId']}
        compareNodes={compareByTitle}
        onNodeClick={vi.fn()}
      /></tbody></table>,
    );

    expect(screen.getByText('Alpha note')).toBeInTheDocument();
    expect(screen.getByText('Outside note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));

    expect(screen.queryByText('Alpha note')).not.toBeInTheDocument();
    expect(screen.getByText('Outside note')).toBeInTheDocument();
  });

  it('sorts siblings and outside-folder nodes while preserving the tree', () => {
    const graph = new Graph();
    graph.addNode(node('alpha', 'Alpha', 'folder', 'Alpha'));
    graph.addNode(node('zeta-note', 'Zeta note', 'file', 'Alpha'));
    graph.addNode(node('beta-note', 'Beta note', 'file', 'Alpha'));
    graph.addNode(node('outside-zeta', 'Outside zeta', 'file', 'Outside/Zeta'));
    graph.addNode(node('outside-alpha', 'Outside alpha', 'file', 'Outside/Alpha'));
    graph.addEdge({ source: 'alpha', target: 'zeta-note', bundleEdgeKind: 'directoryContainment' });
    graph.addEdge({ source: 'alpha', target: 'beta-note', bundleEdgeKind: 'directoryContainment' });

    const { container } = render(
      <table><tbody><StructuralTreeRows
        displayGraph={new DisplayGraph(graph)}
        entryBundleNodeId={'alpha' as IBundleNode['bundleNodeId']}
        compareNodes={compareByTitle}
        onNodeClick={vi.fn()}
      /></tbody></table>,
    );

    expect([...container.querySelectorAll('[data-structure-section="selected-folders"]')]
      .map(row => row.getAttribute('data-bundle-node-name'))).toEqual([
      'Alpha',
      'Beta note',
      'Zeta note',
    ]);
    expect([...container.querySelectorAll('[data-structure-section="outside"]')]
      .map(row => row.getAttribute('data-bundle-node-name'))).toEqual([
      'Outside alpha',
      'Outside zeta',
    ]);
  });

  it('shows image thumbnails without per-row tracking labels', () => {
    const graph = new Graph();
    const alpha = node('alpha', 'Alpha', 'folder', 'Alpha');
    const visual = node('visual', 'Visual map', 'file', 'Alpha');
    alpha.tracked = true;
    visual.tracked = true;
    visual.fileType = 'svg';
    graph.addNode(alpha);
    graph.addNode(visual);
    graph.addEdge({ source: 'alpha', target: 'visual', bundleEdgeKind: 'directoryContainment' });

    render(
      <table><tbody><StructuralTreeRows
        displayGraph={new DisplayGraph(graph)}
        entryBundleNodeId={'alpha' as IBundleNode['bundleNodeId']}
        compareNodes={compareByTitle}
        onNodeClick={vi.fn()}
        renderInlineThumbnail={displayNode => (
          <span data-testid="thumbnail">{displayNode.bundleNodeName} thumbnail</span>
        )}
      /></tbody></table>,
    );

    expect(screen.getByTestId('thumbnail')).toHaveTextContent('Visual map thumbnail');
    expect(screen.queryByText('Tracked')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Tracked')).not.toBeInTheDocument();
  });

  it('compares every list sort field in either direction', () => {
    const graph = new Graph();
    const alpha = node('alpha', 'Alpha', 'file', 'Zeta');
    const beta = node('beta', 'Beta', 'file', 'Alpha');
    alpha.fileType = 'svg';
    beta.fileType = 'md';
    graph.addNode(alpha);
    graph.addNode(beta);
    const displayGraph = new DisplayGraph(graph);
    const alphaDisplay = displayGraph.getDisplayNode('alpha')!;
    const betaDisplay = displayGraph.getDisplayNode('beta')!;
    alphaDisplay.setDistance(2);
    betaDisplay.setDistance(1);

    expect(compareListNodes(alphaDisplay, betaDisplay, 'title', 'asc')).toBeLessThan(0);
    expect(compareListNodes(alphaDisplay, betaDisplay, 'directory', 'asc')).toBeGreaterThan(0);
    expect(compareListNodes(alphaDisplay, betaDisplay, 'fileType', 'asc')).toBeGreaterThan(0);
    expect(compareListNodes(alphaDisplay, betaDisplay, 'depth', 'asc')).toBeGreaterThan(0);
    expect(compareListNodes(alphaDisplay, betaDisplay, 'depth', 'desc')).toBeLessThan(0);
  });
});
