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

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Graph, IBundleNode } from '../../../../../../../contracts/types/graph';
import { createTrackedNodeSelector, createUntrackedNodeSelector, createBlacklistedNodeSelector, createSearchByTitleSelector, createSensitiveNodeSelector, createFolderNodeSelector, useFilterState } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/filters';

describe('Built-in filter order', () => {
  it('keeps primary filters in sidebar order before custom filters', () => {
    const { result } = renderHook(() => useFilterState('', () => Promise.reject(new Error('An empty bundle must not request filters'))));
    const sidebarFilterNames = result.current[0]
      .filter(filter => !filter.showSearchInput && !filter.hideFromFilterList)
      .map(filter => filter.name);

    expect(sidebarFilterNames).toEqual([
      'Untracked',
      'Sensitive',
      'Types',
      'Folders',
      'Blacklisted',
      'Depth Override',
      'Gap',
      'Frontier',
    ]);
  });
});

describe('Bundle Node Selectors', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();

    // Add test nodes
    const nodes: IBundleNode[] = [
      {
        bundleNodeKey: testKey('1'),
        bundleNodeKind: 'file',
        label: 'A',
        bundleNodeName: 'Alpha Page',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 0,
        remaining_depth: 0,
        tracked: true,
        getIdent: () => 'test/Alpha Page.md'
      },
      {
        bundleNodeKey: testKey('2'),
        bundleNodeKind: 'file',
        label: 'B',
        bundleNodeName: 'Beta Process',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: false,
        getIdent: () => 'test/Beta Process.md'
      },
      {
        bundleNodeKey: testKey('3'),
        bundleNodeKind: 'file',
        label: 'C',
        bundleNodeName: 'Gamma Service',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: true,
        blacklisted: true,
        getIdent: () => 'test/Gamma Service.md'
      },
      {
        bundleNodeKey: testKey('4'),
        bundleNodeKind: 'file',
        label: 'D',
        bundleNodeName: 'Delta Handler',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 2,
        remaining_depth: 0,
        tracked: false,
        blacklisted: true,
        getIdent: () => 'test/Delta Handler.md'
      },
      {
        bundleNodeKey: testKey('5'),
        bundleNodeKind: 'file',
        label: 'E',
        bundleNodeName: 'Epsilon Data',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: true,
        sensitive: true,
        getIdent: () => 'test/Epsilon Data.md'
      },
      {
        bundleNodeKey: testKey('6'),
        bundleNodeKind: 'file',
        label: 'F',
        bundleNodeName: 'Phi Process',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 2,
        remaining_depth: 0,
        tracked: false,
        sensitive: true,
        getIdent: () => 'test/Phi Process.md'
      },
      {
        bundleNodeKey: testKey('7'),
        bundleNodeKind: 'file',
        label: 'G',
        bundleNodeName: 'Off Topic Page',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: false,
        offTopic: true,
        getIdent: () => 'test/Off Topic Page.md'
      },
      {
        bundleNodeKey: testKey('8'),
        bundleNodeKind: 'file',
        label: 'H',
        bundleNodeName: 'Another Off Topic',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 2,
        remaining_depth: 0,
        tracked: true,
        offTopic: true,
        getIdent: () => 'test/Another Off Topic.md'
      }
    ];

    nodes.forEach(node => graph.addNode(node));
  });

  describe('Tracked Page Selector', () => {
    it('selects only tracked pages', () => {
      const selector = createTrackedNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(4);
      expect(selectedNodeKeys.has(testKey('1'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('3'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('5'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('8'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('2'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('4'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('6'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('7'))).toBe(false);
    });
  });

  describe('Untracked Page Selector', () => {
    it('selects only untracked pages', () => {
      const selector = createUntrackedNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(4);
      expect(selectedNodeKeys.has(testKey('2'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('4'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('6'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('7'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('1'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('3'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('5'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('8'))).toBe(false);
    });
  });

  describe('Blacklisted Page Selector', () => {
    it('selects only blacklisted pages', () => {
      const selector = createBlacklistedNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(2);
      expect(selectedNodeKeys.has(testKey('3'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('4'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('1'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('2'))).toBe(false);
    });
  });

  describe('Sensitive Page Selector', () => {
    it('selects only sensitive pages', () => {
      const selector = createSensitiveNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(2);
      expect(selectedNodeKeys.has(testKey('5'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('6'))).toBe(true);
      expect(selectedNodeKeys.has(testKey('1'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('2'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('3'))).toBe(false);
      expect(selectedNodeKeys.has(testKey('4'))).toBe(false);
    });
  });

  describe('Search By Title Selector', () => {
    it('returns empty set when search text is empty', () => {
      const selector = createSearchByTitleSelector('');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(0);
    });

    it('selects pages with matching titles (case insensitive)', () => {
      const selector = createSearchByTitleSelector('alpha');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(1);
      expect(selectedNodeKeys.has(testKey('1'))).toBe(true);
    });

    it('selects multiple pages with partial matches', () => {
      const selector = createSearchByTitleSelector('service');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(1);
      expect(selectedNodeKeys.has(testKey('3'))).toBe(true); // Gamma Service
    });

    it('handles special characters in search', () => {
      const selector = createSearchByTitleSelector('.');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(0);
    });
  });

  describe('Folder Page Selector', () => {
    it('selects pages in a folder and all of its descendants', () => {
      const nestedPage = graph.getNode(testKey('2'));
      if (!nestedPage) throw new Error('Expected nested test page');
      nestedPage.sourceGraphSubdirectory = 'test/nested';

      const selectedNodeKeys = createFolderNodeSelector('test').select(graph);

      expect(selectedNodeKeys.size).toBe(8);
      expect(selectedNodeKeys.has(testKey('2'))).toBe(true);
    });

    it('selects only directly-rooted pages for the root folder', () => {
      const rootPage = graph.getNode(testKey('1'));
      if (!rootPage) throw new Error('Expected root test page');
      rootPage.sourceGraphSubdirectory = '';

      const selectedNodeKeys = createFolderNodeSelector('').select(graph);

      expect(selectedNodeKeys).toEqual(testKeySet(['1']));
    });
  });

});

import { testKey } from '../../../../shared/nodeKeys.js';

import { testKeySet } from '../../../../shared/nodeKeys.js';
