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

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDisplayFilters } from '../../../../../src/areas/site/curation/utils/useDisplayFilters';
import type { IFilter } from '../../../../../src/areas/site/curation/types/filters';
import { Graph } from '../../../../../../shared_code/types/graph';
import type { ISiteNode } from '../../../../../../shared_code/types/ISiteNode';
import type { FileType } from '../../../../../../shared_code/types/FileType';
import type { SiteNodeKey } from '../../../../../../shared_code/types/siteNodeConfig';

const fileNode = (key: string, fileType: FileType): ISiteNode => ({
  siteNodeKey: key as SiteNodeKey,
  siteNodeName: key,
  siteNodeKind: 'file',
  sourceGraphSubdirectory: '',
  fileType,
  label: key,
  depth: 0,
  remaining_depth: 0,
  getIdent: () => key,
});

const typesFilter: IFilter = {
  id: 'node-types-filter',
  name: 'Types',
  siteNodeSelectors: [],
  selectorApplicationCriteria: 'union',
  actions: [],
  enabled: true,
  isSolo: false,
  isHidden: false,
  isNodeTypeFilter: true,
  nodeTypeStates: {
    image: { showTitles: true, isSolo: false, isHidden: true },
  },
};

const renderDisplayFilters = (graph: Graph, filter = typesFilter) => renderHook(() => useDisplayFilters({
  filters: [filter],
  graph,
  graphUpdateTrigger: 0,
  hiddenNodeKeys: new Set(),
  selectedNodeKeys: new Set(),
  selectionShowTitles: false,
  siteSlug: 'test-site',
  soloNodeKeys: new Set(),
}));

describe('useDisplayFilters node types', () => {
  it('expands an active image row into a display filter using centralized image types', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));

    const { result } = renderDisplayFilters(graph);
    const imageFilter = result.current.combinedFilters.find(filter => filter.id === 'node-types-filter-image');

    expect(imageFilter).toMatchObject({
      name: 'Type: Image Nodes',
      enabled: true,
      isSolo: false,
      isHidden: true,
      actions: [{ type: 'show_titles' }],
    });
    expect(imageFilter?.siteNodeSelectors[0].select(graph)).toEqual(new Set(['drawing']));
  });

  it('keeps the File Nodes solo bucket disjoint from centralized image types', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));
    const fileSoloFilter: IFilter = {
      ...typesFilter,
      nodeTypeStates: {
        file: { showTitles: false, isSolo: true, isHidden: false },
      },
    };

    const { result } = renderDisplayFilters(graph, fileSoloFilter);
    const fileFilter = result.current.combinedFilters.find(filter => filter.id === 'node-types-filter-file');

    expect(fileFilter).toMatchObject({
      name: 'Type: File Nodes',
      enabled: true,
      isSolo: true,
      isHidden: false,
    });
    expect(fileFilter?.siteNodeSelectors[0].select(graph)).toEqual(new Set(['note']));
  });

  it('does not apply the grouped filter when only one type is present', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));

    const { result } = renderDisplayFilters(graph);

    expect(result.current.combinedFilters.some(filter => filter.id === 'node-types-filter-image')).toBe(false);
  });
});
