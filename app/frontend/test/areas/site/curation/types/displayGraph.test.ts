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
import { Graph, ISiteNode } from '../../../../../../shared_code/types/graph';
import { DisplayGraph } from '../../../../../src/areas/site/curation/types/displayGraph';
import { FilterExpression } from '../../../../../src/areas/site/curation/types/filterExpression';
import { IFilter } from '../../../../../src/areas/site/curation/types/filters';

function createGraph(): Graph {
  const graph = new Graph();
  const pages: ISiteNode[] = ['1', '2', '3'].map(id => ({
    siteNodeKey: id as ISiteNode['siteNodeKey'],
    siteNodeKind: 'file',
    label: id,
    siteNodeName: `Page ${id}`,
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
    siteNodeSelectors: [{
      id: `${id}-selector`,
      name: id,
      type: 'normal',
      select: () => new Set(pages)
    }],
    selectorApplicationCriteria: 'union',
    actions: [],
    enabled: true,
    isSolo: mode === 'solo',
    isHidden: mode === 'hide'
  };
}

describe('DisplayGraph filter expressions', () => {
  it('uses the default solo union when no custom expression is supplied', () => {
    const displayGraph = new DisplayGraph(createGraph());
    displayGraph.setFilters([
      createFilter('alpha', ['1', '2'], 'solo'),
      createFilter('beta', ['2', '3'], 'solo')
    ]);

    expect(displayGraph.visibleDisplayNodes.map(page => page.siteNodeKey)).toEqual(['1', '2', '3']);
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

    expect(displayGraph.visibleDisplayNodes.map(page => page.siteNodeKey)).toEqual(['1']);
  });
});
