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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Graph } from '../../../../../../../shared_code/types/graph';
import { IFilter, IBundleNodeSelector, NodeTypeFilterId, createFolderNodeSelector } from '../types/filters';
import {
  FilterExpression,
  getActiveFilterExpressionTerms,
  reconcileFilterExpression
} from '../types/filterExpression';
import { hasNodesInMultipleFolders } from './folderFilterUtils';
import {
  createNodeTypeFilterSelector,
  getNodeTypeFilterLabel,
  getPresentNodeTypeFilters,
} from './nodeTypeFilterUtils';

interface UseDisplayFiltersOptions {
  filters: IFilter[];
  graph: Graph;
  graphUpdateTrigger: number;
  hiddenNodeKeys: Set<string>;
  selectedNodeKeys: Set<string>;
  selectionShowTitles: boolean;
  bundleSlug: string;
  soloNodeKeys: Set<string>;
}

const createBundleNodeKeySelector = (bundleNodeKeys: Set<string>, name: string): IBundleNodeSelector => ({
  id: `bundle-node-key-selector-${name}`,
  name,
  type: 'normal',
  select: () => new Set(bundleNodeKeys)
});

export function useDisplayFilters({
  filters,
  graph,
  graphUpdateTrigger,
  hiddenNodeKeys,
  selectedNodeKeys,
  selectionShowTitles,
  bundleSlug,
  soloNodeKeys
}: UseDisplayFiltersOptions) {
  const [expressionState, setExpressionState] = useState<{
    bundleSlug: string;
    expression: FilterExpression | null;
  }>({ bundleSlug, expression: null });

  const combinedFilters = useMemo(() => {
    // The graph object is mutated in place, so this revision keeps folder availability current.
    void graphUpdateTrigger;
    const result: IFilter[] = [...filters];
    const folderFilter = filters.find(filter => filter.isFolderFilter);
    const nodeTypeFilter = filters.find(filter => filter.isNodeTypeFilter);

    if (folderFilter && hasNodesInMultipleFolders(graph.getAllNodes())) {
      Object.entries(folderFilter.folderStates || {}).forEach(([folderPath, state]) => {
        if (!state.showTitles && !state.isSolo && !state.isHidden) return;
        result.push({
          id: `folder-filter-${folderPath || 'root'}`,
          name: folderPath ? `Folder: ${folderPath}` : 'Folder: Root',
          bundleNodeSelectors: [createFolderNodeSelector(folderPath)],
          selectorApplicationCriteria: 'union',
          actions: state.showTitles ? [{ type: 'show_titles' }] : [],
          enabled: true,
          isSolo: state.isSolo,
          isHidden: state.isHidden,
          hideFromFilterList: true
        });
      });
    }

    const presentNodeTypeIds = new Set(getPresentNodeTypeFilters(graph).map(type => type.id));
    if (nodeTypeFilter && presentNodeTypeIds.size > 1) {
      Object.entries(nodeTypeFilter.nodeTypeStates || {}).forEach(([nodeTypeId, state]) => {
        if (!state || (!state.showTitles && !state.isSolo && !state.isHidden)) return;
        const typedNodeTypeId = nodeTypeId as NodeTypeFilterId;
        if (!presentNodeTypeIds.has(typedNodeTypeId)) return;
        result.push({
          id: `node-types-filter-${typedNodeTypeId}`,
          name: `Type: ${getNodeTypeFilterLabel(typedNodeTypeId)}`,
          bundleNodeSelectors: [createNodeTypeFilterSelector(typedNodeTypeId)],
          selectorApplicationCriteria: 'union',
          actions: state.showTitles ? [{ type: 'show_titles' }] : [],
          enabled: true,
          isSolo: state.isSolo,
          isHidden: state.isHidden,
          hideFromFilterList: true,
        });
      });
    }

    if (soloNodeKeys.size > 0) {
      result.push({
        id: 'selection-solo-filter',
        name: 'Selection Solo',
        bundleNodeSelectors: [createBundleNodeKeySelector(soloNodeKeys, 'solo-nodes')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: true,
        isHidden: false,
        hideFromFilterList: true
      });
    }

    if (selectionShowTitles && selectedNodeKeys.size > 0) {
      result.push({
        id: 'selection-titles-filter',
        name: 'Selection Titles',
        bundleNodeSelectors: [createBundleNodeKeySelector(selectedNodeKeys, 'title-nodes')],
        selectorApplicationCriteria: 'union',
        actions: [
          { type: 'highlight', color: '#fbbf24', isDashed: false },
          { type: 'show_titles' }
        ],
        enabled: true,
        isSolo: false,
        isHidden: false,
        hideFromFilterList: true
      });
    }

    if (hiddenNodeKeys.size > 0) {
      result.push({
        id: 'selection-hide-filter',
        name: 'Hidden Selection',
        bundleNodeSelectors: [createBundleNodeKeySelector(hiddenNodeKeys, 'hidden-nodes')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: false,
        isHidden: true,
        hideFromFilterList: true
      });
    }

    return result;
  }, [filters, graph, graphUpdateTrigger, hiddenNodeKeys, selectedNodeKeys, selectionShowTitles, soloNodeKeys]);

  const activeTerms = useMemo(() => getActiveFilterExpressionTerms(combinedFilters), [combinedFilters]);
  const storedExpression = expressionState.bundleSlug === bundleSlug ? expressionState.expression : null;
  const effectiveExpression = useMemo(
    () => reconcileFilterExpression(storedExpression, activeTerms),
    [activeTerms, storedExpression]
  );

  useEffect(() => {
    if (effectiveExpression !== storedExpression) {
      setExpressionState({ bundleSlug, expression: effectiveExpression });
    }
  }, [effectiveExpression, bundleSlug, storedExpression]);

  const setExpression = useCallback((expression: FilterExpression) => {
    setExpressionState({ bundleSlug, expression });
  }, [bundleSlug]);

  return { combinedFilters, effectiveExpression, setExpression };
}
