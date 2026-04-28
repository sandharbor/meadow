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
import { Graph } from '../../../shared_code/types/graph';
import { loadFixtureGraph, FixtureLoadResult } from './helpers/fixtureLoader';
import {
  createTrackedPageSelector,
  createUntrackedPageSelector,
  createBlacklistedPageSelector,
  createSensitivePageSelector,
  createSearchByTitleSelector,
  createCustomPageSelector
} from '../utils/filterSelectors';
import type { CustomPageSelectorConfig } from '../../../shared_code/types/customFilters';

describe('Filter Integration Tests', () => {
  let graph: Graph;
  let fixtureResult: FixtureLoadResult;

  beforeEach(() => {
    fixtureResult = loadFixtureGraph('home_fixture_big_and_small', 'meadow-test-site-big');
    graph = fixtureResult.graph;
  });

  describe('built-in filter selectors', () => {
    describe('tracked pages filter', () => {
      it('selects pages that are tracked according to site_page_config', () => {
        const selector = createTrackedPageSelector();
        const selectedPages = selector.select(graph);

        // Verify we got some tracked pages
        expect(selectedPages.size).toBeGreaterThan(0);

        // Verify all selected pages are actually tracked
        selectedPages.forEach(pageId => {
          const page = graph.getPage(pageId);
          expect(page?.tracked).toBe(true);
        });

        // Verify known tracked page is selected (main page is tracked)
        const mainPage = graph.getAllPages().find(n => n.title === 'main page');
        expect(mainPage).toBeDefined();
        if (mainPage) {
          expect(selectedPages.has(mainPage.id)).toBe(true);
        }
      });
    });

    describe('untracked pages filter', () => {
      it('selects pages that are not tracked', () => {
        const selector = createUntrackedPageSelector();
        const selectedPages = selector.select(graph);

        // Verify all selected pages are not tracked
        selectedPages.forEach(pageId => {
          const page = graph.getPage(pageId);
          expect(page?.tracked).toBeFalsy();
        });

        // The untracked set should be the complement of tracked
        const trackedSelector = createTrackedPageSelector();
        const trackedPages = trackedSelector.select(graph);

        // No overlap between tracked and untracked
        selectedPages.forEach(pageId => {
          expect(trackedPages.has(pageId)).toBe(false);
        });
      });
    });

    describe('blacklisted pages filter', () => {
      it('selects the t007 blacklisted page', () => {
        const selector = createBlacklistedPageSelector();
        const selectedPages = selector.select(graph);

        // Find the blacklisted page
        const blacklistedPage = graph.getAllPages().find(n =>
          n.title === 't007 ---- blacklisted page'
        );

        expect(blacklistedPage).toBeDefined();
        if (blacklistedPage) {
          expect(selectedPages.has(blacklistedPage.id)).toBe(true);
          expect(blacklistedPage.blacklisted).toBe(true);
        }

        // Verify all selected pages are actually blacklisted
        selectedPages.forEach(pageId => {
          const page = graph.getPage(pageId);
          expect(page?.blacklisted).toBe(true);
        });
      });
    });

    describe('sensitive pages filter', () => {
      it('selects pages marked as sensitive', () => {
        const selector = createSensitivePageSelector();
        const selectedPages = selector.select(graph);

        // Find the sensitive test page we added
        const sensitivePage = graph.getAllPages().find(n =>
          n.title === 't004 ---- sensitive page'
        );

        // The sensitive page should exist and be selected
        if (sensitivePage) {
          expect(selectedPages.has(sensitivePage.id)).toBe(true);
          expect(sensitivePage.sensitive).toBe(true);
        }

        // Verify all selected pages are actually sensitive
        selectedPages.forEach(pageId => {
          const page = graph.getPage(pageId);
          expect(page?.sensitive).toBe(true);
        });
      });
    });

    describe('search by title filter', () => {
      it('selects pages matching the search text', () => {
        const selector = createSearchByTitleSelector('blacklisted');
        const selectedPages = selector.select(graph);

        // Should find pages with "blacklisted" in the title
        expect(selectedPages.size).toBeGreaterThan(0);

        // Verify all selected pages contain the search text
        selectedPages.forEach(pageId => {
          const page = graph.getPage(pageId);
          expect(page?.title.toLowerCase()).toContain('blacklisted');
        });
      });

      it('returns empty set for search text less than 2 characters', () => {
        const selector = createSearchByTitleSelector('a');
        const selectedPages = selector.select(graph);
        expect(selectedPages.size).toBe(0);
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
      const config: CustomPageSelectorConfig = {
        field: 'title',
        matchType: 'regex',
        value: 't0\\d{2}',
        caseSensitive: false
      };

      const selector = createCustomPageSelector(config);
      const selectedPages = selector.select(graph);

      // Should match pages like t001, t002, t003, etc.
      expect(selectedPages.size).toBeGreaterThan(0);

      // Verify all selected pages match the pattern
      selectedPages.forEach(pageId => {
        const page = graph.getPage(pageId);
        expect(page?.title).toMatch(/t0\d{2}/i);
      });
    });

    it('custom substring filter selects pages containing the substring', () => {
      // Create a custom filter that matches titles containing "transclusion"
      const config: CustomPageSelectorConfig = {
        field: 'title',
        matchType: 'substring',
        value: 'transclusion',
        caseSensitive: false
      };

      const selector = createCustomPageSelector(config);
      const selectedPages = selector.select(graph);

      // Should match pages with "transclusion" in the title
      expect(selectedPages.size).toBeGreaterThan(0);

      // Verify all selected pages contain the substring
      selectedPages.forEach(pageId => {
        const page = graph.getPage(pageId);
        expect(page?.title.toLowerCase()).toContain('transclusion');
      });
    });

    it('case sensitive custom filter respects case', () => {
      // Create a case-sensitive filter
      const config: CustomPageSelectorConfig = {
        field: 'title',
        matchType: 'substring',
        value: 'Main', // Capital M
        caseSensitive: true
      };

      const selector = createCustomPageSelector(config);
      const selectedPages = selector.select(graph);

      // "main page" has lowercase 'm', so should not match
      const mainPage = graph.getAllPages().find(n => n.title === 'main page');
      if (mainPage) {
        expect(selectedPages.has(mainPage.id)).toBe(false);
      }
    });
  });
});
