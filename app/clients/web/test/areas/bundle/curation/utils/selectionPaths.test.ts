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

import { describe, it, expect } from 'vitest';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import type { FileBundleNode } from '../../../../../../../contracts/types/IBundleNode';
import { getSelectionChildrenOrdered, getSelectionDeeperPathsFromHereOrdered, getSelectionPathFromHereOrdered, getSelectionPathToHereOrdered } from '../../../../../src/areas/bundle/curation/utils/selectionPaths';

function makePage(id: string, overrides: Partial<FileBundleNode> = {}): IBundleNode {
  return {
    bundleNodeKey: testKey(id),
    bundleNodeKind: 'file',
    label: id,
    bundleNodeName: id,
    sourceGraphSubdirectory: '',
    fileType: 'md',
    depth: 0,
    remaining_depth: 0,
    remaining_inlinks_depth: 0,
    getIdent: () => id,
    ...overrides,
  };
}

describe('selectionPaths', () => {
  describe('getSelectionPathToHereOrdered', () => {
    it('puts the node first, then ancestors back to root', () => {
      const node = makePage('C', { path: [testKey('A'), testKey('B'), testKey('C')] });
      expect(getSelectionPathToHereOrdered(node)).toEqual(['C', 'B', 'A'].map(testKey));
    });

    it('handles missing path', () => {
      const node = makePage('X');
      expect(getSelectionPathToHereOrdered(node)).toEqual(['X'].map(testKey));
    });

    it('dedupes while preserving order', () => {
      const node = makePage('C', { path: [testKey('A'), testKey('B'), testKey('B'), testKey('C'), testKey('A')] });
      expect(getSelectionPathToHereOrdered(node)).toEqual(['C', 'A', 'B'].map(testKey));
    });
  });

  describe('getSelectionPathFromHereOrdered', () => {
    it('selects descendants following directed edges', () => {
      const g = new Graph();
      ['A', 'B', 'C', 'D', 'E'].forEach((id) => g.addNode(makePage(id)));
      g.addEdge({ source: testKey('A'), target: testKey('B') });
      g.addEdge({ source: testKey('B'), target: testKey('C') });
      g.addEdge({ source: testKey('A'), target: testKey('D') });
      g.addEdge({ source: testKey('C'), target: testKey('E') });

      expect(getSelectionPathFromHereOrdered(g, testKey('B'))).toEqual(['B', 'C', 'E'].map(testKey));
    });

    it('treats bidirectional edges as traversable both ways', () => {
      const g = new Graph();
      ['A', 'B', 'C'].forEach((id) => g.addNode(makePage(id)));
      g.addEdge({ source: testKey('A'), target: testKey('B'), isBidirectional: true });
      g.addEdge({ source: testKey('B'), target: testKey('C') });

      expect(getSelectionPathFromHereOrdered(g, testKey('B'))).toEqual(['B', 'A', 'C'].map(testKey));
    });

    it('returns empty when startNodeKey is not in the graph', () => {
      const g = new Graph();
      g.addNode(makePage('A'));
      expect(getSelectionPathFromHereOrdered(g, testKey('Z'))).toEqual([].map(testKey));
    });
  });

  describe('getSelectionDeeperPathsFromHereOrdered', () => {
    it('follows edges only to higher-depth nodes', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 0 }));
      g.addNode(makePage('B', { depth: 1 }));
      g.addNode(makePage('C', { depth: 2 }));
      g.addNode(makePage('D', { depth: 1 }));
      g.addEdge({ source: testKey('A'), target: testKey('B') });
      g.addEdge({ source: testKey('B'), target: testKey('C') });
      g.addEdge({ source: testKey('A'), target: testKey('D') });

      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('A'))).toEqual(['A', 'B', 'C', 'D'].map(testKey));
    });

    it('skips links to same-depth or lower-depth nodes', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 1 }));
      g.addNode(makePage('B', { depth: 2 }));
      g.addNode(makePage('C', { depth: 1 }));
      g.addNode(makePage('D', { depth: 0 }));
      g.addEdge({ source: testKey('A'), target: testKey('B') });
      g.addEdge({ source: testKey('A'), target: testKey('C') });
      g.addEdge({ source: testKey('A'), target: testKey('D') });

      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('A'))).toEqual(['A', 'B'].map(testKey));
    });

    it('works with bidirectional edges (only follows the deeper direction)', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 0 }));
      g.addNode(makePage('B', { depth: 1 }));
      g.addNode(makePage('C', { depth: 2 }));
      g.addEdge({ source: testKey('B'), target: testKey('A'), isBidirectional: true });
      g.addEdge({ source: testKey('B'), target: testKey('C') });

      // From B (depth 1): A is depth 0 (skip), C is depth 2 (follow)
      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('B'))).toEqual(['B', 'C'].map(testKey));
    });

    it('treats structural descendants as deeper even when their semantic depth is lower', () => {
      const g = new Graph();
      g.addNode(makePage('Alpha', { depth: 1 }));
      g.addNode(makePage('Alpha note', { depth: 0 }));
      g.addNode(makePage('Nested', { depth: 2 }));
      g.addNode(makePage('Nested note', { depth: 0 }));
      g.addNode(makePage('Outside', { depth: 1 }));
      g.addNode(makePage('Beyond outside', { depth: 2 }));
      g.addEdge({ source: testKey('Alpha'), target: testKey('Alpha note'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Alpha'), target: testKey('Nested'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Nested'), target: testKey('Nested note'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Alpha note'), target: testKey('Outside') });
      g.addEdge({ source: testKey('Outside'), target: testKey('Beyond outside') });

      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('Alpha'))).toEqual([
        'Alpha',
        'Alpha note',
        'Outside',
        'Beyond outside',
        'Nested',
        'Nested note',
      ].map(testKey));
    });

    it('returns just the start node when no deeper neighbors exist', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 5 }));
      g.addNode(makePage('B', { depth: 3 }));
      g.addEdge({ source: testKey('A'), target: testKey('B') });

      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('A'))).toEqual(['A'].map(testKey));
    });

    it('returns empty when startNodeKey is not in the graph', () => {
      const g = new Graph();
      g.addNode(makePage('A'));
      expect(getSelectionDeeperPathsFromHereOrdered(g, testKey('Z'))).toEqual([].map(testKey));
    });
  });

  describe('getSelectionChildrenOrdered', () => {
    it('selects the node and its direct children (depth + 1)', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 0 }));
      g.addNode(makePage('B', { depth: 1 }));
      g.addNode(makePage('C', { depth: 1 }));
      g.addNode(makePage('D', { depth: 2 }));
      g.addEdge({ source: testKey('A'), target: testKey('B') });
      g.addEdge({ source: testKey('A'), target: testKey('C') });
      g.addEdge({ source: testKey('B'), target: testKey('D') });

      expect(getSelectionChildrenOrdered(g, testKey('A'))).toEqual(['A', 'B', 'C'].map(testKey));
    });

    it('excludes edges to nodes at same or lower depth', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 1 }));
      g.addNode(makePage('B', { depth: 2 }));
      g.addNode(makePage('C', { depth: 1 }));
      g.addEdge({ source: testKey('A'), target: testKey('B') });
      g.addEdge({ source: testKey('A'), target: testKey('C') });

      expect(getSelectionChildrenOrdered(g, testKey('A'))).toEqual(['A', 'B'].map(testKey));
    });

    it('selects direct structural children regardless of semantic depth', () => {
      const g = new Graph();
      g.addNode(makePage('Alpha', { depth: 1 }));
      g.addNode(makePage('Alpha note', { depth: 0 }));
      g.addNode(makePage('Visual map', { depth: 0 }));
      g.addNode(makePage('Nested', { depth: 2 }));
      g.addNode(makePage('Nested note', { depth: 0 }));
      g.addEdge({ source: testKey('Alpha'), target: testKey('Alpha note'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Alpha'), target: testKey('Visual map'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Alpha'), target: testKey('Nested'), bundleEdgeKind: 'directoryContainment' });
      g.addEdge({ source: testKey('Nested'), target: testKey('Nested note'), bundleEdgeKind: 'directoryContainment' });

      expect(getSelectionChildrenOrdered(g, testKey('Alpha'))).toEqual([
        'Alpha',
        'Alpha note',
        'Visual map',
        'Nested',
      ].map(testKey));
    });

    it('returns only the node when it has no children', () => {
      const g = new Graph();
      g.addNode(makePage('A', { depth: 2 }));
      expect(getSelectionChildrenOrdered(g, testKey('A'))).toEqual(['A'].map(testKey));
    });

    it('returns empty when startNodeKey is not in the graph', () => {
      const g = new Graph();
      g.addNode(makePage('A'));
      expect(getSelectionChildrenOrdered(g, testKey('Z'))).toEqual([].map(testKey));
    });
  });
});

import { testKey } from '../../../../shared/nodeKeys.js';
