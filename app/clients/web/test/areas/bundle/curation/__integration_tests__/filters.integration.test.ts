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

/**
 * Integration tests for filter selectors using fixture data.
 * These tests load fixture configs directly and build a graph from them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Graph } from '../../../../../../../shared_code/types/graph';
import { loadFixtureGraph, FixtureLoadResult } from './helpers/fixtureLoader';
import {
  createTrackedNodeSelector,
  createUntrackedNodeSelector,
  createBlacklistedNodeSelector,
  createSensitiveNodeSelector,
  createSearchByTitleSelector,
  createCustomBundleNodeSelector
} from '../../../../../src/areas/bundle/curation/utils/filterSelectors';
import type { CustomBundleNodeSelectorConfig } from '../../../../../../../shared_code/types/customFilters';

describe('Filter Integration Tests', () => {
  let graph: Graph;
  let fixtureResult: FixtureLoadResult;

  beforeEach(() => {
    fixtureResult = loadFixtureGraph('home_fixture_big_and_small', 'meadow-test-bundle-big');
    graph = fixtureResult.graph;
  });

  describe('built-in filter selectors', () => {
    describe('tracked pages filter', () => {
      it('selects pages that are tracked according to bundle_node_config', () => {
        const selector = createTrackedNodeSelector();
        const selectedNodeKeys = selector.select(graph);

        // Verify we got some tracked pages
        expect(selectedNodeKeys.size).toBeGreaterThan(0);

        // Verify all selected pages are actually tracked
        selectedNodeKeys.forEach(bundleNodeKey => {
          const page = graph.getNode(bundleNodeKey);
          expect(page?.tracked).toBe(true);
        });

        // Verify known tracked page is selected (main page is tracked)
        const mainPage = graph.getAllNodes().find(n => n.bundleNodeName === 'main page');
        expect(mainPage).toBeDefined();
        if (mainPage) {
          expect(selectedNodeKeys.has(mainPage.bundleNodeKey)).toBe(true);
        }
      });
    });

    describe('untracked pages filter', () => {
      it('selects pages that are not tracked', () => {
        const selector = createUntrackedNodeSelector();
        const selectedNodeKeys = selector.select(graph);

        // Verify all selected pages are not tracked
        selectedNodeKeys.forEach(bundleNodeKey => {
          const page = graph.getNode(bundleNodeKey);
          expect(page?.tracked).toBeFalsy();
        });

        // The untracked set should be the complement of tracked
        const trackedSelector = createTrackedNodeSelector();
        const trackedPages = trackedSelector.select(graph);

        // No overlap between tracked and untracked
        selectedNodeKeys.forEach(bundleNodeKey => {
          expect(trackedPages.has(bundleNodeKey)).toBe(false);
        });
      });
    });

    describe('blacklisted pages filter', () => {
      it('selects the t007 blacklisted page', () => {
        const selector = createBlacklistedNodeSelector();
        const selectedNodeKeys = selector.select(graph);

        // Find the blacklisted page
        const blacklistedPage = graph.getAllNodes().find(n =>
          n.bundleNodeName === 't007 ---- blacklisted page'
        );

        expect(blacklistedPage).toBeDefined();
        if (blacklistedPage) {
          expect(selectedNodeKeys.has(blacklistedPage.bundleNodeKey)).toBe(true);
          expect(blacklistedPage.blacklisted).toBe(true);
        }

        // Verify all selected pages are actually blacklisted
        selectedNodeKeys.forEach(bundleNodeKey => {
          const page = graph.getNode(bundleNodeKey);
          expect(page?.blacklisted).toBe(true);
        });
      });
    });

    describe('sensitive pages filter', () => {
      it('selects pages marked as sensitive', () => {
        const selector = createSensitiveNodeSelector();
        const selectedNodeKeys = selector.select(graph);

        // Find the sensitive test page we added
        const sensitivePage = graph.getAllNodes().find(n =>
          n.bundleNodeName === 't004 ---- sensitive page'
        );

        // The sensitive page should exist and be selected
        if (sensitivePage) {
          expect(selectedNodeKeys.has(sensitivePage.bundleNodeKey)).toBe(true);
          expect(sensitivePage.sensitive).toBe(true);
        }

        // Verify all selected pages are actually sensitive
        selectedNodeKeys.forEach(bundleNodeKey => {
          const page = graph.getNode(bundleNodeKey);
          expect(page?.sensitive).toBe(true);
        });
      });
    });

    describe('search by title filter', () => {
      it('selects pages matching the search text', () => {
        const selector = createSearchByTitleSelector('blacklisted');
        const selectedNodeKeys = selector.select(graph);

        // Should find pages with "blacklisted" in the title
        expect(selectedNodeKeys.size).toBeGreaterThan(0);

        // Verify all selected pages contain the search text
        selectedNodeKeys.forEach(bundleNodeKey => {
          const page = graph.getNode(bundleNodeKey);
          expect(page?.bundleNodeName.toLowerCase()).toContain('blacklisted');
        });
      });

      it('returns empty set for search text less than 2 characters', () => {
        const selector = createSearchByTitleSelector('a');
        const selectedNodeKeys = selector.select(graph);
        expect(selectedNodeKeys.size).toBe(0);
      });

      it('is case insensitive', () => {
        const lowerSelector = createSearchByTitleSelector('main');
        const upperSelector = createSearchByTitleSelector('MAIN');

        const lowerResults = lowerSelector.select(graph);
        const upperResults = upperSelector.select(graph);

        expect(lowerResults.size).toBe(upperResults.size);
      });
    });
  });

  describe('custom filter selectors', () => {
    it('custom regex filter selects pages matching the pattern', () => {
      // Create a custom filter that matches titles with "t0" followed by two digits
      const config: CustomBundleNodeSelectorConfig = {
        field: 'title',
        matchType: 'regex',
        value: 't0\\d{2}',
        caseSensitive: false
      };

      const selector = createCustomBundleNodeSelector(config);
      const selectedNodeKeys = selector.select(graph);

      // Should match pages like t001, t002, t003, etc.
      expect(selectedNodeKeys.size).toBeGreaterThan(0);

      // Verify all selected pages match the pattern
      selectedNodeKeys.forEach(bundleNodeKey => {
        const page = graph.getNode(bundleNodeKey);
        expect(page?.bundleNodeName).toMatch(/t0\d{2}/i);
      });
    });

    it('custom substring filter selects pages containing the substring', () => {
      // Create a custom filter that matches titles containing "transclusion"
      const config: CustomBundleNodeSelectorConfig = {
        field: 'title',
        matchType: 'substring',
        value: 'transclusion',
        caseSensitive: false
      };

      const selector = createCustomBundleNodeSelector(config);
      const selectedNodeKeys = selector.select(graph);

      // Should match pages with "transclusion" in the title
      expect(selectedNodeKeys.size).toBeGreaterThan(0);

      // Verify all selected pages contain the substring
      selectedNodeKeys.forEach(bundleNodeKey => {
        const page = graph.getNode(bundleNodeKey);
        expect(page?.bundleNodeName.toLowerCase()).toContain('transclusion');
      });
    });

    it('case sensitive custom filter respects case', () => {
      // Create a case-sensitive filter
      const config: CustomBundleNodeSelectorConfig = {
        field: 'title',
        matchType: 'substring',
        value: 'Main', // Capital M
        caseSensitive: true
      };

      const selector = createCustomBundleNodeSelector(config);
      const selectedNodeKeys = selector.select(graph);

      // "main page" has lowercase 'm', so should not match
      const mainPage = graph.getAllNodes().find(n => n.bundleNodeName === 'main page');
      if (mainPage) {
        expect(selectedNodeKeys.has(mainPage.bundleNodeKey)).toBe(false);
      }
    });
  });
});
