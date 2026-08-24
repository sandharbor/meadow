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
import { Graph, IBundleNode } from '../../../../../../../shared_code/types/graph';
import StructuralTreeRows from '../../../../../src/areas/bundle/curation/components/StructuralTreeRows';
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
        onNodeClick={vi.fn()}
      /></tbody></table>,
    );

    expect(screen.getByText('Alpha note')).toBeInTheDocument();
    expect(screen.getByText('Outside note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Alpha' }));

    expect(screen.queryByText('Alpha note')).not.toBeInTheDocument();
    expect(screen.getByText('Outside note')).toBeInTheDocument();
  });
});
