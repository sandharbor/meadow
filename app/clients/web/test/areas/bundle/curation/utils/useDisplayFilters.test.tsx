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
import { useDisplayFilters } from '../../../../../src/areas/bundle/curation/utils/useDisplayFilters';
import type { IFilter } from '../../../../../src/areas/bundle/curation/types/filters';
import { Graph } from '../../../../../../../shared_code/types/graph';
import type { IBundleNode } from '../../../../../../../shared_code/types/IBundleNode';
import type { FileType } from '../../../../../../../shared_code/types/FileType';
import type { BundleNodeKey } from '../../../../../../../shared_code/types/bundleNodeConfig';

const fileNode = (key: string, fileType: FileType): IBundleNode => ({
  bundleNodeKey: key as BundleNodeKey,
  bundleNodeName: key,
  bundleNodeKind: 'file',
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
  bundleNodeSelectors: [],
  selectorApplicationCriteria: 'union',
  actions: [],
  enabled: true,
  isSolo: false,
  isHidden: false,
  isNodeTypeFilter: true,
  nodeTypeStates: {
    excalidraw: { showTitles: true, isSolo: false, isHidden: true },
  },
};

const renderDisplayFilters = (graph: Graph, filter = typesFilter) => renderHook(() => useDisplayFilters({
  filters: [filter],
  graph,
  graphUpdateTrigger: 0,
  hiddenNodeKeys: new Set(),
  selectedNodeKeys: new Set(),
  selectionShowTitles: false,
  bundleSlug: 'test-bundle',
  soloNodeKeys: new Set(),
}));

describe('useDisplayFilters node types', () => {
  it('expands an active Excalidraw row into a type-specific display filter', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));

    const { result } = renderDisplayFilters(graph);
    const excalidrawFilter = result.current.combinedFilters.find(
      filter => filter.id === 'node-types-filter-excalidraw'
    );

    expect(excalidrawFilter).toMatchObject({
      name: 'Type: Excalidraw',
      enabled: true,
      isSolo: false,
      isHidden: true,
      actions: [{ type: 'show_titles' }],
    });
    expect(excalidrawFilter?.bundleNodeSelectors[0].select(graph)).toEqual(new Set(['drawing']));
  });

  it('solos Markdown independently from Excalidraw', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('drawing', 'excalidraw'));
    const markdownSoloFilter: IFilter = {
      ...typesFilter,
      nodeTypeStates: {
        md: { showTitles: false, isSolo: true, isHidden: false },
      },
    };

    const { result } = renderDisplayFilters(graph, markdownSoloFilter);
    const markdownFilter = result.current.combinedFilters.find(
      filter => filter.id === 'node-types-filter-md'
    );

    expect(markdownFilter).toMatchObject({
      name: 'Type: Markdown',
      enabled: true,
      isSolo: true,
      isHidden: false,
    });
    expect(markdownFilter?.bundleNodeSelectors[0].select(graph)).toEqual(new Set(['note']));
  });

  it('groups jpg and jpeg files into one JPEG row', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));
    graph.addNode(fileNode('short-extension', 'jpg'));
    graph.addNode(fileNode('long-extension', 'jpeg'));
    const jpegSoloFilter: IFilter = {
      ...typesFilter,
      nodeTypeStates: {
        jpeg: { showTitles: false, isSolo: true, isHidden: false },
      },
    };

    const { result } = renderDisplayFilters(graph, jpegSoloFilter);
    const jpegFilter = result.current.combinedFilters.find(
      filter => filter.id === 'node-types-filter-jpeg'
    );

    expect(jpegFilter).toMatchObject({
      name: 'Type: JPEG',
      enabled: true,
      isSolo: true,
      isHidden: false,
    });
    expect(jpegFilter?.bundleNodeSelectors[0].select(graph)).toEqual(
      new Set(['short-extension', 'long-extension'])
    );
  });

  it('does not apply the grouped filter when only one type is present', () => {
    const graph = new Graph();
    graph.addNode(fileNode('note', 'md'));

    const { result } = renderDisplayFilters(graph);

    expect(result.current.combinedFilters.some(filter => filter.id === 'node-types-filter-excalidraw')).toBe(false);
  });
});
