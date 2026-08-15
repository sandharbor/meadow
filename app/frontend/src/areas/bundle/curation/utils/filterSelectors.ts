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
import { IBundleNode } from '../../../../../../shared_code/types/IBundleNode.js';
import { CustomBundleNodeSelectorConfig } from '../../../../../../shared_code/types/customFilters.js';
import { nodeIsInFolder } from './folderFilterUtils.js';
import type { BundleNodeKind } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import type { FileType } from '../../../../../../shared_code/types/FileType.js';

export interface SelectorBase {
  id: string;
  name: string;
  select: (graph: Graph) => Set<string>;
}

export interface INormalBundleNodeSelector extends SelectorBase {
  type: 'normal';
  searchInput?: string;
}

export type IBundleNodeSelector = INormalBundleNodeSelector;

// Cache for search functions to avoid recreating them
const searchFunctionCache = new Map<string, (graph: Graph) => Set<string>>();

// Page selector functions
export const createTrackedNodeSelector = (): INormalBundleNodeSelector => ({
  id: 'tracked-pages',
  name: 'Tracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (node.tracked) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createBundleNodeKindSelector = (bundleNodeKind: BundleNodeKind): INormalBundleNodeSelector => ({
  id: `node-kind-${bundleNodeKind}`,
  name: bundleNodeKind === 'collection' ? 'Bundle Homes' : `${bundleNodeKind[0].toUpperCase()}${bundleNodeKind.slice(1)} Nodes`,
  type: 'normal',
  select: (graph: Graph) => new Set(
    graph.getAllNodes().filter(node => node.bundleNodeKind === bundleNodeKind).map(node => node.bundleNodeKey)
  ),
});

export const createFileTypeNodeSelector = (
  fileTypes: readonly FileType[],
  name: string,
): INormalBundleNodeSelector => {
  const matchingFileTypes = new Set(fileTypes);
  return {
    id: `file-type-${fileTypes.join('-')}`,
    name,
    type: 'normal',
    select: (graph: Graph) => new Set(
      graph.getAllNodes()
        .filter(node => node.bundleNodeKind === 'file' && matchingFileTypes.has(node.fileType))
        .map(node => node.bundleNodeKey)
    ),
  };
};

export const createSelectedScopeRootSelector = (): INormalBundleNodeSelector => ({
  id: 'selected-scope-roots',
  name: 'Selected Scope Roots',
  type: 'normal',
  select: (graph: Graph) => {
    const membershipTargets = new Set(
      graph.getAllEdges().filter(edge => edge.bundleEdgeKind === 'collectionMembership').map(edge => edge.target)
    );
    const result = new Set<string>(membershipTargets);
    for (const node of graph.getAllNodes()) {
      if (node.bundleNodeKind !== 'folder') continue;
      const hasStructuralParent = graph.getIncomingEdges(node.bundleNodeKey)
        .some(edge => edge.bundleEdgeKind !== 'semanticLink');
      if (!hasStructuralParent && node.tracked) result.add(node.bundleNodeKey);
    }
    return result;
  },
});

export const createNodeWithOverrideSelector = (): INormalBundleNodeSelector => ({
  id: 'overrides',
  name: 'Depth Override',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      // The initial node (depth 0) is not considered an override — its depth
      // settings are part of the base bundle configuration, not a per-node
      // override.
      if (node.depth === 0) return;
      const conf = node.conf;
      if (conf) {
        if (conf.outlinksDepth !== undefined || conf.inlinksDepth !== undefined) {
            selectedNodeKeys.add(node.bundleNodeKey);
        }
      }
    });
    return selectedNodeKeys;
  }
});

export const createUntrackedNodeSelector = (): INormalBundleNodeSelector => ({
  id: 'untracked-pages',
  name: 'Untracked Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (!node.tracked) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createBlacklistedNodeSelector = (): INormalBundleNodeSelector => ({
  id: 'blacklisted-pages',
  name: 'Blacklisted Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (node.blacklisted) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createSearchByTitleSelector = (searchText: string = ''): INormalBundleNodeSelector => {
  // Use cached search function if available
  let selectFunction = searchFunctionCache.get(searchText);

  if (!selectFunction) {
    selectFunction = (graph: Graph) => {
      const selectedNodeKeys = new Set<string>();
      // Only search when there are 2 or more characters to avoid overwhelming results
      if (!searchText || searchText.length < 2) return selectedNodeKeys;

      const searchLower = searchText.toLowerCase();
      graph.getAllNodes().forEach((node: IBundleNode) => {
        if (node.bundleNodeName.toLowerCase().includes(searchLower)) {
          selectedNodeKeys.add(node.bundleNodeKey);
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

export const createSensitiveNodeSelector = (): INormalBundleNodeSelector => ({
  id: 'sensitive-pages',
  name: 'Sensitive Pages',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (node.sensitive) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createFrontierNodeSelector = (): INormalBundleNodeSelector => ({
  id: 'frontier',
  name: 'Frontier',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (node.isFrontierNode) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createFolderNodeSelector = (folderPath: string): INormalBundleNodeSelector => ({
  id: `folder-${folderPath || 'root'}`,
  name: folderPath ? `Folder: ${folderPath}` : 'Folder: Root',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      if (nodeIsInFolder(node.sourceGraphSubdirectory, folderPath)) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createOutlinkDiscrepancySelector = (threshold: number = 5): INormalBundleNodeSelector => ({
  id: 'outlink-gap',
  name: 'Outlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      const allTargets = graph.getAllOutlinkTargets(node.bundleNodeKey);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getNode(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedNodeKeys.add(node.bundleNodeKey);
      }
    });
    return selectedNodeKeys;
  }
});

export const createInlinkDiscrepancySelector = (threshold: number = 5): INormalBundleNodeSelector => ({
  id: 'inlink-gap',
  name: 'Inlink Gap',
  type: 'normal',
  select: (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();
    graph.getAllNodes().forEach((node: IBundleNode) => {
      const allSources = graph.getAllInlinkSources(node.bundleNodeKey);
      const sourceCount = allSources.length;
      const workingCount = allSources.filter(id => graph.getNode(id)).length;
      if (sourceCount - workingCount >= threshold) {
        selectedNodeKeys.add(node.bundleNodeKey);
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

  graph.getAllNodes().forEach((node: IBundleNode) => {
    let gap: number;
    if (gapType === 'outlink') {
      const allTargets = graph.getAllOutlinkTargets(node.bundleNodeKey);
      const sourceCount = allTargets.length;
      const workingCount = allTargets.filter(id => graph.getNode(id)).length;
      gap = sourceCount - workingCount;
    } else {
      const allSources = graph.getAllInlinkSources(node.bundleNodeKey);
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
export const createCustomBundleNodeSelector = (
  config: CustomBundleNodeSelectorConfig,
  onError?: (message: string, error: unknown) => void
): INormalBundleNodeSelector => {
  const selectFunction = (graph: Graph) => {
    const selectedNodeKeys = new Set<string>();

    graph.getAllNodes().forEach((node: IBundleNode) => {
      let matchValue = '';

      // Get the value to match against based on the field
      switch (config.field) {
        case 'title':
          matchValue = node.bundleNodeName || '';
          break;
        case 'path': {
          // Construct a path-like string (e.g., "dir/subdir/title.md") so users can
          // filter with natural path syntax like "/gt/" to match directory boundaries.
          // Normalize backslashes to forward slashes for cross-platform compatibility.
          const subdir = (node.sourceGraphSubdirectory || '').replace(/\\/g, '/');
          const title = node.bundleNodeName || '';
          const ext = node.fileType || 'md';
          matchValue = subdir ? `${subdir}/${title}.${ext}` : `${title}.${ext}`;
          break;
        }
        case 'content':
          // For content matching, we'd need to load file content
          // For now, we'll match against node title as a fallback
          matchValue = node.bundleNodeName || '';
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
        selectedNodeKeys.add(node.bundleNodeKey);
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
