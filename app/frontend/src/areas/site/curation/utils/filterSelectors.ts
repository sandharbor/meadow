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

import { Graph } from '../../../../../../shared_code/types/graph.js';
import { ISiteNode } from '../../../../../../shared_code/types/ISiteNode.js';
import { CustomSiteNodeSelectorConfig } from '../../../../../../shared_code/types/customFilters.js';
import { nodeIsInFolder } from './folderFilterUtils.js';

export interface SelectorBase {
  id: string;
  name: string;
  select: (graph: Graph) => Set<string>;
}

export interface INormalSiteNodeSelector extends SelectorBase {
  type: 'normal';
  searchInput?: string;
}

export type ISiteNodeSelector = INormalSiteNodeSelector;

// Cache for search functions to avoid recreating them
const searchFunctionCache = new Map<string, (graph: Graph) => Set<string>>();

// Page selector functions
export const createTrackedNodeSelector = (): INormalSiteNodeSelector => ({
  id: 'tracked-pages',
  name: 'Tracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (node.tracked) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createNodeWithOverrideSelector = (): INormalSiteNodeSelector => ({
  id: 'overrides',
  name: 'Depth Override',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      // The initial node (depth 0) is not considered an override — its depth
      // settings are part of the base site configuration, not a per-node
      // override.
      if (node.depth === 0) return;
      const conf = node.conf;
      if (conf) {
        if (conf.outlinksDepth !== undefined || conf.inlinksDepth !== undefined) {
            selectedNodeKeys.add(node.siteNodeKey);
        }
      }
    });
    return selectedNodeKeys;
  }
});

export const createUntrackedNodeSelector = (): INormalSiteNodeSelector => ({
  id: 'untracked-pages',
  name: 'Untracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (!node.tracked) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createBlacklistedNodeSelector = (): INormalSiteNodeSelector => ({
  id: 'blacklisted-pages',
  name: 'Blacklisted Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (node.blacklisted) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createSearchByTitleSelector = (searchText: string = ''): INormalSiteNodeSelector => {
  // Use cached search function if available
  let selectFunction = searchFunctionCache.get(searchText);

  if (!selectFunction) {
    selectFunction = (graph: Graph) => {
      const selectedNodeKeys = new Set<string>();
      // Only search when there are 2 or more characters to avoid overwhelming results
      if (!searchText || searchText.length < 2) return selectedNodeKeys;

      const searchLower = searchText.toLowerCase();
      graph.getAllNodes().forEach((node: ISiteNode) => {
        if (node.siteNodeName.toLowerCase().includes(searchLower)) {
          selectedNodeKeys.add(node.siteNodeKey);
        }
      });
      return selectedNodeKeys;
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

export const createSensitiveNodeSelector = (): INormalSiteNodeSelector => ({
  id: 'sensitive-pages',
  name: 'Sensitive Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (node.sensitive) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createFrontierNodeSelector = (): INormalSiteNodeSelector => ({
  id: 'frontier',
  name: 'Frontier',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (node.isFrontierNode) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createFolderNodeSelector = (folderPath: string): INormalSiteNodeSelector => ({
  id: `folder-${folderPath || 'root'}`,
  name: folderPath ? `Folder: ${folderPath}` : 'Folder: Root',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      if (nodeIsInFolder(node.sourceGraphSubdirectory, folderPath)) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createOutlinkDiscrepancySelector = (threshold: number = 5): INormalSiteNodeSelector => ({
  id: 'outlink-gap',
  name: 'Outlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      const allTargets = graph.getAllOutlinkTargets(node.siteNodeKey);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getNode(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createInlinkDiscrepancySelector = (threshold: number = 5): INormalSiteNodeSelector => ({
  id: 'inlink-gap',
  name: 'Inlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: ISiteNode) => {
      const allSources = graph.getAllInlinkSources(node.siteNodeKey);
      const sourceCount = allSources.length;
      const workingCount = allSources.filter(id => graph.getNode(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });
    return selectedNodeKeys;
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

  graph.getAllNodes().forEach((node: ISiteNode) => {
    let gap: number;
    if (gapType === 'outlink') {
      const allTargets = graph.getAllOutlinkTargets(node.siteNodeKey);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getNode(id)).length;
      gap = sourceCount - workingCount;
    } else {
      const allSources = graph.getAllInlinkSources(node.siteNodeKey);
      const sourceCount = allSources.length;
      const workingCount = allSources.filter(id => graph.getNode(id)).length;
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
 * Create custom filter node selector.
 * @param config - The custom node selector configuration
 * @param onError - Optional callback for regex parsing errors (defaults to console.warn)
 */
export const createCustomSiteNodeSelector = (
  config: CustomSiteNodeSelectorConfig,
  onError?: (message: string, error: unknown) => void
): INormalSiteNodeSelector => {
  const selectFunction = (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();

    graph.getAllNodes().forEach((node: ISiteNode) => {
      let matchValue = '';

      // Get the value to match against based on the field
      switch (config.field) {
        case 'title':
          matchValue = node.siteNodeName || '';
          break;
        case 'path': {
          // Construct a path-like string (e.g., "dir/subdir/title.md") so users can
          // filter with natural path syntax like "/gt/" to match directory boundaries.
          // Normalize backslashes to forward slashes for cross-platform compatibility.
          const subdir = (node.sourceGraphSubdirectory || '').replace(/\\/g, '/');
          const title = node.siteNodeName || '';
          const ext = node.fileType || 'md';
          matchValue = subdir ? `${subdir}/${title}.${ext}` : `${title}.${ext}`;
          break;
        }
        case 'content':
          // For content matching, we'd need to load file content
          // For now, we'll match against node title as a fallback
          matchValue = node.siteNodeName || '';
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
        selectedNodeKeys.add(node.siteNodeKey);
      }
    });

    return selectedNodeKeys;
  };

  return {
    id: `custom-selector-${config.field}-${config.matchType}`,
    name: `Custom ${config.field} ${config.matchType}`,
    type: 'normal',
    select: selectFunction
  };
};
