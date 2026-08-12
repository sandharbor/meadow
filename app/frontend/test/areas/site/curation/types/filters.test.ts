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
import { Graph, ISiteNode } from '../../../../../../shared_code/types/graph';
import { createTrackedNodeSelector, createUntrackedNodeSelector, createBlacklistedNodeSelector, createSearchByTitleSelector, createSensitiveNodeSelector, createFolderNodeSelector } from '../../../../../src/areas/site/curation/types/filters';

describe('Site Node Selectors', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();

    // Add test nodes
    const nodes: ISiteNode[] = [
      {
        siteNodeKey: '1' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'A',
        siteNodeName: 'Alpha Page',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 0,
        remaining_depth: 0,
        tracked: true,
        getIdent: () => 'test/Alpha Page.md'
      },
      {
        siteNodeKey: '2' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'B',
        siteNodeName: 'Beta Process',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: false,
        getIdent: () => 'test/Beta Process.md'
      },
      {
        siteNodeKey: '3' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'C',
        siteNodeName: 'Gamma Service',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: true,
        blacklisted: true,
        getIdent: () => 'test/Gamma Service.md'
      },
      {
        siteNodeKey: '4' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'D',
        siteNodeName: 'Delta Handler',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 2,
        remaining_depth: 0,
        tracked: false,
        blacklisted: true,
        getIdent: () => 'test/Delta Handler.md'
      },
      {
        siteNodeKey: '5' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'E',
        siteNodeName: 'Epsilon Data',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: true,
        sensitive: true,
        getIdent: () => 'test/Epsilon Data.md'
      },
      {
        siteNodeKey: '6' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'F',
        siteNodeName: 'Phi Process',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 2,
        remaining_depth: 0,
        tracked: false,
        sensitive: true,
        getIdent: () => 'test/Phi Process.md'
      },
      {
        siteNodeKey: '7' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'G',
        siteNodeName: 'Off Topic Page',
        sourceGraphSubdirectory: 'test',
        fileType: 'md',
        depth: 1,
        remaining_depth: 0,
        tracked: false,
        offTopic: true,
        getIdent: () => 'test/Off Topic Page.md'
      },
      {
        siteNodeKey: '8' as ISiteNode['siteNodeKey'],
        siteNodeKind: 'file',
        label: 'H',
        siteNodeName: 'Another Off Topic',
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
      expect(selectedNodeKeys.has('1')).toBe(true);
      expect(selectedNodeKeys.has('3')).toBe(true);
      expect(selectedNodeKeys.has('5')).toBe(true);
      expect(selectedNodeKeys.has('8')).toBe(true);
      expect(selectedNodeKeys.has('2')).toBe(false);
      expect(selectedNodeKeys.has('4')).toBe(false);
      expect(selectedNodeKeys.has('6')).toBe(false);
      expect(selectedNodeKeys.has('7')).toBe(false);
    });
  });

  describe('Untracked Page Selector', () => {
    it('selects only untracked pages', () => {
      const selector = createUntrackedNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(4);
      expect(selectedNodeKeys.has('2')).toBe(true);
      expect(selectedNodeKeys.has('4')).toBe(true);
      expect(selectedNodeKeys.has('6')).toBe(true);
      expect(selectedNodeKeys.has('7')).toBe(true);
      expect(selectedNodeKeys.has('1')).toBe(false);
      expect(selectedNodeKeys.has('3')).toBe(false);
      expect(selectedNodeKeys.has('5')).toBe(false);
      expect(selectedNodeKeys.has('8')).toBe(false);
    });
  });

  describe('Blacklisted Page Selector', () => {
    it('selects only blacklisted pages', () => {
      const selector = createBlacklistedNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(2);
      expect(selectedNodeKeys.has('3')).toBe(true);
      expect(selectedNodeKeys.has('4')).toBe(true);
      expect(selectedNodeKeys.has('1')).toBe(false);
      expect(selectedNodeKeys.has('2')).toBe(false);
    });
  });

  describe('Sensitive Page Selector', () => {
    it('selects only sensitive pages', () => {
      const selector = createSensitiveNodeSelector();
      const selectedNodeKeys = selector.select(graph);

      expect(selectedNodeKeys.size).toBe(2);
      expect(selectedNodeKeys.has('5')).toBe(true);
      expect(selectedNodeKeys.has('6')).toBe(true);
      expect(selectedNodeKeys.has('1')).toBe(false);
      expect(selectedNodeKeys.has('2')).toBe(false);
      expect(selectedNodeKeys.has('3')).toBe(false);
      expect(selectedNodeKeys.has('4')).toBe(false);
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
      expect(selectedNodeKeys.has('1')).toBe(true);
    });

    it('selects multiple pages with partial matches', () => {
      const selector = createSearchByTitleSelector('service');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(1);
      expect(selectedNodeKeys.has('3')).toBe(true); // Gamma Service
    });

    it('handles special characters in search', () => {
      const selector = createSearchByTitleSelector('.');
      const selectedNodeKeys = selector.select(graph);
      expect(selectedNodeKeys.size).toBe(0);
    });
  });

  describe('Folder Page Selector', () => {
    it('selects pages in a folder and all of its descendants', () => {
      const nestedPage = graph.getNode('2');
      if (!nestedPage) throw new Error('Expected nested test page');
      nestedPage.sourceGraphSubdirectory = 'test/nested';

      const selectedNodeKeys = createFolderNodeSelector('test').select(graph);

      expect(selectedNodeKeys.size).toBe(8);
      expect(selectedNodeKeys.has('2')).toBe(true);
    });

    it('selects only directly-rooted pages for the root folder', () => {
      const rootPage = graph.getNode('1');
      if (!rootPage) throw new Error('Expected root test page');
      rootPage.sourceGraphSubdirectory = '';

      const selectedNodeKeys = createFolderNodeSelector('').select(graph);

      expect(selectedNodeKeys).toEqual(new Set(['1']));
    });
  });

});
