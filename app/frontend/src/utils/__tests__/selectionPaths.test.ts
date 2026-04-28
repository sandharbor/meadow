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
import { Graph, IPage } from '../../../../shared_code/types/graph';
import { getSelectionChildrenOrdered, getSelectionDeeperPathsFromHereOrdered, getSelectionPathFromHereOrdered, getSelectionPathToHereOrdered } from '../selectionPaths';

function makePage(id: string, overrides: Partial<IPage> = {}): IPage {
  return {
    id,
    label: id,
    title: id,
    sourceGraphSubdirectory: '',
    file_type: 'md',
    depth: 0,
    remaining_depth: 0,
    remaining_inlinks_depth: 0,
    getIdent: () => id,
    ...overrides,
  };
}

describe('selectionPaths', () => {
  describe('getSelectionPathToHereOrdered', () => {
    it('puts the page first, then ancestors back to root', () => {
      const page = makePage('C', { path: ['A', 'B', 'C'] });
      expect(getSelectionPathToHereOrdered(page)).toEqual(['C', 'B', 'A']);
    });

    it('handles missing path', () => {
      const page = makePage('X');
      expect(getSelectionPathToHereOrdered(page)).toEqual(['X']);
    });

    it('dedupes while preserving order', () => {
      const page = makePage('C', { path: ['A', 'B', 'B', 'C', 'A'] });
      expect(getSelectionPathToHereOrdered(page)).toEqual(['C', 'A', 'B']);
    });
  });

  describe('getSelectionPathFromHereOrdered', () => {
    it('selects descendants following directed edges', () => {
      const g = new Graph();
      ['A', 'B', 'C', 'D', 'E'].forEach((id) => g.addPage(makePage(id)));
      g.addEdge({ source: 'A', target: 'B' });
      g.addEdge({ source: 'B', target: 'C' });
      g.addEdge({ source: 'A', target: 'D' });
      g.addEdge({ source: 'C', target: 'E' });

      expect(getSelectionPathFromHereOrdered(g, 'B')).toEqual(['B', 'C', 'E']);
    });

    it('treats bidirectional edges as traversable both ways', () => {
      const g = new Graph();
      ['A', 'B', 'C'].forEach((id) => g.addPage(makePage(id)));
      g.addEdge({ source: 'A', target: 'B', isBidirectional: true });
      g.addEdge({ source: 'B', target: 'C' });

      expect(getSelectionPathFromHereOrdered(g, 'B')).toEqual(['B', 'A', 'C']);
    });

    it('returns empty when startId is not in the graph', () => {
      const g = new Graph();
      g.addPage(makePage('A'));
      expect(getSelectionPathFromHereOrdered(g, 'Z')).toEqual([]);
    });
  });

  describe('getSelectionDeeperPathsFromHereOrdered', () => {
    it('follows edges only to higher-depth pages', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 0 }));
      g.addPage(makePage('B', { depth: 1 }));
      g.addPage(makePage('C', { depth: 2 }));
      g.addPage(makePage('D', { depth: 1 }));
      g.addEdge({ source: 'A', target: 'B' });
      g.addEdge({ source: 'B', target: 'C' });
      g.addEdge({ source: 'A', target: 'D' });

      expect(getSelectionDeeperPathsFromHereOrdered(g, 'A')).toEqual(['A', 'B', 'C', 'D']);
    });

    it('skips links to same-depth or lower-depth pages', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 1 }));
      g.addPage(makePage('B', { depth: 2 }));
      g.addPage(makePage('C', { depth: 1 }));
      g.addPage(makePage('D', { depth: 0 }));
      g.addEdge({ source: 'A', target: 'B' });
      g.addEdge({ source: 'A', target: 'C' });
      g.addEdge({ source: 'A', target: 'D' });

      expect(getSelectionDeeperPathsFromHereOrdered(g, 'A')).toEqual(['A', 'B']);
    });

    it('works with bidirectional edges (only follows the deeper direction)', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 0 }));
      g.addPage(makePage('B', { depth: 1 }));
      g.addPage(makePage('C', { depth: 2 }));
      g.addEdge({ source: 'B', target: 'A', isBidirectional: true });
      g.addEdge({ source: 'B', target: 'C' });

      // From B (depth 1): A is depth 0 (skip), C is depth 2 (follow)
      expect(getSelectionDeeperPathsFromHereOrdered(g, 'B')).toEqual(['B', 'C']);
    });

    it('returns just the start page when no deeper neighbors exist', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 5 }));
      g.addPage(makePage('B', { depth: 3 }));
      g.addEdge({ source: 'A', target: 'B' });

      expect(getSelectionDeeperPathsFromHereOrdered(g, 'A')).toEqual(['A']);
    });

    it('returns empty when startId is not in the graph', () => {
      const g = new Graph();
      g.addPage(makePage('A'));
      expect(getSelectionDeeperPathsFromHereOrdered(g, 'Z')).toEqual([]);
    });
  });

  describe('getSelectionChildrenOrdered', () => {
    it('selects the page and its direct children (depth + 1)', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 0 }));
      g.addPage(makePage('B', { depth: 1 }));
      g.addPage(makePage('C', { depth: 1 }));
      g.addPage(makePage('D', { depth: 2 }));
      g.addEdge({ source: 'A', target: 'B' });
      g.addEdge({ source: 'A', target: 'C' });
      g.addEdge({ source: 'B', target: 'D' });

      expect(getSelectionChildrenOrdered(g, 'A')).toEqual(['A', 'B', 'C']);
    });

    it('excludes edges to pages at same or lower depth', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 1 }));
      g.addPage(makePage('B', { depth: 2 }));
      g.addPage(makePage('C', { depth: 1 }));
      g.addEdge({ source: 'A', target: 'B' });
      g.addEdge({ source: 'A', target: 'C' });

      expect(getSelectionChildrenOrdered(g, 'A')).toEqual(['A', 'B']);
    });

    it('returns only the page when it has no children', () => {
      const g = new Graph();
      g.addPage(makePage('A', { depth: 2 }));
      expect(getSelectionChildrenOrdered(g, 'A')).toEqual(['A']);
    });

    it('returns empty when startId is not in the graph', () => {
      const g = new Graph();
      g.addPage(makePage('A'));
      expect(getSelectionChildrenOrdered(g, 'Z')).toEqual([]);
    });
  });
});


