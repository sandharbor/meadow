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
import { Graph, IPage } from '../../../../shared_code/types/graph';
import { createTrackedPageSelector, createUntrackedPageSelector, createBlacklistedPageSelector, createSearchByTitleSelector, createSensitivePageSelector } from '../filters';

describe('Page Selectors', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();

    // Add test pages
    const pages: IPage[] = [
      { 
        id: '1', 
        label: 'A', 
        title: 'Alpha Page',
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 0, 
        remaining_depth: 0, 
        tracked: true,
        getIdent: () => 'test/Alpha Page.md'
      },
      { 
        id: '2', 
        label: 'B', 
        title: 'Beta Process', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 1, 
        remaining_depth: 0, 
        tracked: false,
        getIdent: () => 'test/Beta Process.md'
      },
      { 
        id: '3', 
        label: 'C', 
        title: 'Gamma Service', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 1, 
        remaining_depth: 0, 
        tracked: true, 
        blacklisted: true,
        getIdent: () => 'test/Gamma Service.md'
      },
      { 
        id: '4', 
        label: 'D', 
        title: 'Delta Handler', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 2, 
        remaining_depth: 0, 
        tracked: false, 
        blacklisted: true,
        getIdent: () => 'test/Delta Handler.md'
      },
      { 
        id: '5', 
        label: 'E', 
        title: 'Epsilon Data', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 1, 
        remaining_depth: 0, 
        tracked: true, 
        sensitive: true,
        getIdent: () => 'test/Epsilon Data.md'
      },
      { 
        id: '6', 
        label: 'F', 
        title: 'Phi Process', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 2, 
        remaining_depth: 0, 
        tracked: false, 
        sensitive: true,
        getIdent: () => 'test/Phi Process.md'
      },
      { 
        id: '7', 
        label: 'G', 
        title: 'Off Topic Page',
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 1, 
        remaining_depth: 0, 
        tracked: false, 
        offTopic: true,
        getIdent: () => 'test/Off Topic Page.md'
      },
      { 
        id: '8', 
        label: 'H', 
        title: 'Another Off Topic', 
        sourceGraphSubdirectory: 'test', 
        file_type: 'md', 
        depth: 2, 
        remaining_depth: 0, 
        tracked: true, 
        offTopic: true,
        getIdent: () => 'test/Another Off Topic.md'
      }
    ];

    pages.forEach(page => graph.addPage(page));
  });

  describe('Tracked Page Selector', () => {
    it('selects only tracked pages', () => {
      const selector = createTrackedPageSelector();
      const selectedPages = selector.select(graph);

      expect(selectedPages.size).toBe(4);
      expect(selectedPages.has('1')).toBe(true);
      expect(selectedPages.has('3')).toBe(true);
      expect(selectedPages.has('5')).toBe(true);
      expect(selectedPages.has('8')).toBe(true);
      expect(selectedPages.has('2')).toBe(false);
      expect(selectedPages.has('4')).toBe(false);
      expect(selectedPages.has('6')).toBe(false);
      expect(selectedPages.has('7')).toBe(false);
    });
  });

  describe('Untracked Page Selector', () => {
    it('selects only untracked pages', () => {
      const selector = createUntrackedPageSelector();
      const selectedPages = selector.select(graph);

      expect(selectedPages.size).toBe(4);
      expect(selectedPages.has('2')).toBe(true);
      expect(selectedPages.has('4')).toBe(true);
      expect(selectedPages.has('6')).toBe(true);
      expect(selectedPages.has('7')).toBe(true);
      expect(selectedPages.has('1')).toBe(false);
      expect(selectedPages.has('3')).toBe(false);
      expect(selectedPages.has('5')).toBe(false);
      expect(selectedPages.has('8')).toBe(false);
    });
  });

  describe('Blacklisted Page Selector', () => {
    it('selects only blacklisted pages', () => {
      const selector = createBlacklistedPageSelector();
      const selectedPages = selector.select(graph);

      expect(selectedPages.size).toBe(2);
      expect(selectedPages.has('3')).toBe(true);
      expect(selectedPages.has('4')).toBe(true);
      expect(selectedPages.has('1')).toBe(false);
      expect(selectedPages.has('2')).toBe(false);
    });
  });

  describe('Sensitive Page Selector', () => {
    it('selects only sensitive pages', () => {
      const selector = createSensitivePageSelector();
      const selectedPages = selector.select(graph);

      expect(selectedPages.size).toBe(2);
      expect(selectedPages.has('5')).toBe(true);
      expect(selectedPages.has('6')).toBe(true);
      expect(selectedPages.has('1')).toBe(false);
      expect(selectedPages.has('2')).toBe(false);
      expect(selectedPages.has('3')).toBe(false);
      expect(selectedPages.has('4')).toBe(false);
    });
  });

  describe('Search By Title Selector', () => {
    it('returns empty set when search text is empty', () => {
      const selector = createSearchByTitleSelector('');
      const selectedPages = selector.select(graph);
      expect(selectedPages.size).toBe(0);
    });

    it('selects pages with matching titles (case insensitive)', () => {
      const selector = createSearchByTitleSelector('alpha');
      const selectedPages = selector.select(graph);
      expect(selectedPages.size).toBe(1);
      expect(selectedPages.has('1')).toBe(true);
    });

    it('selects multiple pages with partial matches', () => {
      const selector = createSearchByTitleSelector('service');
      const selectedPages = selector.select(graph);
      expect(selectedPages.size).toBe(1);
      expect(selectedPages.has('3')).toBe(true); // Gamma Service
    });

    it('handles special characters in search', () => {
      const selector = createSearchByTitleSelector('.');
      const selectedPages = selector.select(graph);
      expect(selectedPages.size).toBe(0);
    });
  });

}); 