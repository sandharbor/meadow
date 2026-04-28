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
 * Filter selector functions for identifying pages in a graph.
 * These are pure functions used by the frontend.
 */

import { Graph } from '../../../shared_code/types/graph.js';
import { ISitePage } from '../../../shared_code/types/ISitePage.js';
import { CustomPageSelectorConfig } from '../../../shared_code/types/customFilters.js';

export interface SelectorBase {
  id: string;
  name: string;
  select: (graph: Graph) => Set<string>;
}

export interface INormalPageSelector extends SelectorBase {
  type: 'normal';
  searchInput?: string;
}

export type IPageSelector = INormalPageSelector;

// Cache for search functions to avoid recreating them
const searchFunctionCache = new Map<string, (graph: Graph) => Set<string>>();

// Page selector functions
export const createTrackedPageSelector = (): INormalPageSelector => ({
  id: 'tracked-pages',
  name: 'Tracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      if (page.tracked) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createPageWithOverrideSelector = (): INormalPageSelector => ({
  id: 'overrides',
  name: 'Depth Override',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      // The initial page (depth 0) is not considered an override — its depth
      // settings are part of the base site configuration, not a per-page
      // override.
      if (page.depth === 0) return;
      const conf = page.conf;
      if (conf) {
        if (conf.config.outlinks_depth !== undefined || conf.config.inlinks_depth !== undefined) {
            selectedPages.add(page.id);
        }
      }
    });
    return selectedPages;
  }
});

export const createUntrackedPageSelector = (): INormalPageSelector => ({
  id: 'untracked-pages',
  name: 'Untracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      if (!page.tracked) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createBlacklistedPageSelector = (): INormalPageSelector => ({
  id: 'blacklisted-pages',
  name: 'Blacklisted Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      if (page.blacklisted) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createSearchByTitleSelector = (searchText: string = ''): INormalPageSelector => {
  // Use cached search function if available
  let selectFunction = searchFunctionCache.get(searchText);

  if (!selectFunction) {
    selectFunction = (graph: Graph) => {
      const selectedPages = new Set<string>();
      // Only search when there are 2 or more characters to avoid overwhelming results
      if (!searchText || searchText.length < 2) return selectedPages;

      const searchLower = searchText.toLowerCase();
      graph.getAllPages().forEach((page: ISitePage) => {
        if (page.title.toLowerCase().includes(searchLower)) {
          selectedPages.add(page.id);
        }
      });
      return selectedPages;
    };

    // Cache the function for reuse, but limit cache size to prevent memory leaks
    if (searchFunctionCache.size < 100) {
      searchFunctionCache.set(searchText, selectFunction);
    }
  }

  return {
    id: 'search-by-title',
    name: 'Search By Title',
    type: 'normal',
    searchInput: searchText,
    select: selectFunction
  };
};

export const createSensitivePageSelector = (): INormalPageSelector => ({
  id: 'sensitive-pages',
  name: 'Sensitive Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      if (page.sensitive) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createFrontierPageSelector = (): INormalPageSelector => ({
  id: 'frontier',
  name: 'Frontier',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      if (page.isFrontierPage) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createOutlinkDiscrepancySelector = (threshold: number = 5): INormalPageSelector => ({
  id: 'outlink-gap',
  name: 'Outlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      const allTargets = graph.getAllOutlinkTargets(page.id);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getPage(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

export const createInlinkDiscrepancySelector = (threshold: number = 5): INormalPageSelector => ({
  id: 'inlink-gap',
  name: 'Inlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedPages = new Set<string>();
    graph.getAllPages().forEach((page: ISitePage) => {
      const allSources = graph.getAllInlinkSources(page.id);
      const sourceCount = allSources.length;
      const workingCount = allSources.filter(id => graph.getPage(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedPages.add(page.id);
      }
    });
    return selectedPages;
  }
});

/**
 * Calculate an optimal gap threshold that will select approximately the target number of pages.
 * @param graph - The graph to analyze
 * @param gapType - 'outlink' or 'inlink' to specify which gap to calculate
 * @param targetPageCount - Target number of pages to select (default: 3)
 * @returns The calculated threshold, or a high default if no gaps exist
 */
export const calculateOptimalGapThreshold = (
  graph: Graph,
  gapType: 'outlink' | 'inlink',
  targetPageCount: number = 3
): number => {
  const gaps: number[] = [];

  graph.getAllPages().forEach((page: ISitePage) => {
    let gap: number;
    if (gapType === 'outlink') {
      const allTargets = graph.getAllOutlinkTargets(page.id);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getPage(id)).length;
      gap = sourceCount - workingCount;
    } else {
      const allSources = graph.getAllInlinkSources(page.id);
      const sourceCount = allSources.length;
      const workingCount = allSources.filter(id => graph.getPage(id)).length;
      gap = sourceCount - workingCount;
    }

    if (gap > 0) {
      gaps.push(gap);
    }
  });

  // No pages have gaps - return a high threshold
  if (gaps.length === 0) {
    return 999;
  }

  // Sort descending
  gaps.sort((a, b) => b - a);

  // Find the threshold that would select approximately targetPageCount pages
  // Use the value at targetPageCount-1 index (or the last available if fewer)
  const targetIndex = Math.min(targetPageCount - 1, gaps.length - 1);
  return gaps[targetIndex];
};

/**
 * Create custom filter page selector.
 * @param config - The custom page selector configuration
 * @param onError - Optional callback for regex parsing errors (defaults to console.warn)
 */
export const createCustomPageSelector = (
  config: CustomPageSelectorConfig,
  onError?: (message: string, error: unknown) => void
): INormalPageSelector => {
  const selectFunction = (graph: Graph) => {
    const selectedPages = new Set<string>();

    graph.getAllPages().forEach((page: ISitePage) => {
      let matchValue = '';

      // Get the value to match against based on the field
      switch (config.field) {
        case 'title':
          matchValue = page.title || '';
          break;
        case 'path': {
          // Construct a path-like string (e.g., "dir/subdir/title.md") so users can
          // filter with natural path syntax like "/gt/" to match directory boundaries.
          // Normalize backslashes to forward slashes for cross-platform compatibility.
          const subdir = (page.sourceGraphSubdirectory || '').replace(/\\/g, '/');
          const title = page.title || '';
          const ext = page.file_type || 'md';
          matchValue = subdir ? `${subdir}/${title}.${ext}` : `${title}.${ext}`;
          break;
        }
        case 'content':
          // For content matching, we'd need to load file content
          // For now, we'll match against page title as a fallback
          matchValue = page.title || '';
          break;
      }

      // Apply case sensitivity
      const valueToMatch = config.caseSensitive ? matchValue : matchValue.toLowerCase();
      let searchValue = config.caseSensitive ? config.value : config.value.toLowerCase();

      // Normalize backslashes to forward slashes in path searches for cross-platform compatibility
      if (config.field === 'path') {
        searchValue = searchValue.replace(/\\/g, '/');
      }

      // Perform the match based on match type
      let matches = false;

      if (config.matchType === 'substring') {
        matches = valueToMatch.includes(searchValue);
      } else if (config.matchType === 'regex') {
        try {
          const flags = config.caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(config.value, flags);
          matches = regex.test(valueToMatch);
        } catch (error) {
          // Invalid regex, no matches
          if (onError) {
            onError(`Invalid regex pattern: ${config.value}`, error);
          }
          matches = false;
        }
      }

      if (matches) {
        selectedPages.add(page.id);
      }
    });

    return selectedPages;
  };

  return {
    id: `custom-selector-${config.field}-${config.matchType}`,
    name: `Custom ${config.field} ${config.matchType}`,
    type: 'normal',
    select: selectFunction
  };
};
