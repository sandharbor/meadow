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

import { describe, expect, it } from 'vitest';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/shared/bundle-graph/graph';
import { DisplayGraph } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/displayGraph';
import { FilterExpression } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/filterExpression';
import { IFilter } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/filters';

function createGraph(): Graph {
  const graph = new Graph();
  const pages: IBundleNode[] = ['1', '2', '3'].map(id => ({
    bundleNodeKey: testKey(id),
    bundleNodeKind: 'file',
    label: id,
    bundleNodeName: `Page ${id}`,
    sourceGraphSubdirectory: '',
    fileType: 'md',
    depth: 0,
    remaining_depth: 0,
    tracked: true,
    getIdent: () => `Page ${id}.md`
  }));
  pages.forEach(page => graph.addNode(page));
  return graph;
}

function createFilter(id: string, pages: string[], mode: 'solo' | 'hide'): IFilter {
  return {
    id,
    name: id,
    bundleNodeSelectors: [{
      id: `${id}-selector`,
      name: id,
      type: 'normal',
      select: () => testKeySet(new Set(pages))
    }],
    selectorApplicationCriteria: 'union',
    actions: [],
    enabled: true,
    isSolo: mode === 'solo',
    isHidden: mode === 'hide'
  };
}

describe('DisplayGraph filter expressions', () => {
  it('explains enabled matches independently of highlight actions and clears stale matches', () => {
    const graph = createGraph();
    graph.getNode(testKey('2'))!.sensitive = true;
    const plain = { ...createFilter('Plain match', ['1'], 'solo'), isSolo: false };
    const sensitive = { ...createFilter('Private', ['1'], 'solo'), isSolo: false, actions: [{ type: 'mark_sensitive' as const }] };
    const colored = { ...createFilter('Colored private', ['1'], 'solo'), isSolo: false,
      actions: [{ type: 'mark_sensitive' as const }, { type: 'highlight' as const, color: '#123456', isDashed: true }] };
    const display = new DisplayGraph(graph);
    display.setFilters([plain, sensitive, colored, { ...sensitive, id: 'disabled', enabled: false }]);
    const node = display.getDisplayNode(testKey('1'))!;
    expect(node.matchingFilters.map(filter => [filter.filterName, filter.color, filter.marksSensitive])).toEqual([
      ['Plain match', undefined, false], ['Private', undefined, true], ['Colored private', '#123456', true],
    ]);
    expect(node.highlights).toHaveLength(1);
    expect(node.isEffectivelySensitive).toBe(true);
    expect(graph.getNode(testKey('1'))?.sensitive).toBeUndefined();
    expect(display.getDisplayNode(testKey('3'))?.matchingFilters).toEqual([]);
    display.setFilters([{ ...sensitive, enabled: false }]);
    expect(node.matchingFilters).toEqual([]);
    expect(node.highlights).toEqual([]);
    expect(node.isEffectivelySensitive).toBe(false);
    expect(display.getDisplayNode(testKey('2'))?.isEffectivelySensitive).toBe(true);
  });
  it('restores Fade after a solo ends without hiding or changing tracked nodes', () => {
    const graph = createGraph();
    const faded = { ...createFilter('context', ['1', '2'], 'solo'), isSolo: false, actions: [{ type: 'fade' as const }] };
    const solo = createFilter('focus', ['1'], 'solo');
    const context = new DisplayGraph(graph);
    context.setFilters([faded]);
    expect(context.getDisplayNode(testKey('1'))?.isFaded).toBe(true);
    expect(context.getDisplayNode(testKey('1'))?.isVisible).toBe(true);
    const focused = new DisplayGraph(graph);
    focused.setFilters([faded, solo]);
    expect(focused.getDisplayNode(testKey('1'))?.isFaded).toBe(false);
    expect(faded.actions).toEqual([{ type: 'fade' }]);
    const restored = new DisplayGraph(graph);
    restored.setFilters([faded, { ...solo, isSolo: false }]);
    expect(restored.getDisplayNode(testKey('1'))?.isFaded).toBe(true);
    expect(graph.getAllNodes().every(node => node.tracked)).toBe(true);
  });
  it('uses the default solo union when no custom expression is supplied', () => {
    const displayGraph = new DisplayGraph(createGraph());
    displayGraph.setFilters([
      createFilter('alpha', ['1', '2'], 'solo'),
      createFilter('beta', ['2', '3'], 'solo')
    ]);

    expect(displayGraph.visibleDisplayNodes.map(page => page.bundleNodeKey)).toEqual(['1', '2', '3'].map(testKey));
  });

  it('applies a custom intersection and the complement represented by Hide', () => {
    const displayGraph = new DisplayGraph(createGraph());
    const expression: FilterExpression = {
      type: 'group',
      id: 'only-alpha-not-beta',
      operator: 'intersection',
      children: [
        { type: 'filter', filterId: 'alpha', mode: 'solo' },
        { type: 'filter', filterId: 'beta', mode: 'hide' }
      ]
    };
    displayGraph.setFilters([
      createFilter('alpha', ['1', '2'], 'solo'),
      createFilter('beta', ['2', '3'], 'hide')
    ], expression);

    expect(displayGraph.visibleDisplayNodes.map(page => page.bundleNodeKey)).toEqual(['1'].map(testKey));
  });
});

import { testKeySet, testKey } from '../../../../shared/nodeKeys.js';
