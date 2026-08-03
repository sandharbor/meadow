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
import { Graph } from '../../../../../../shared_code/types/graph';
import { IFilter, IPageSelector, createFolderPageSelector } from '../types/filters';
import {
  FilterExpression,
  getActiveFilterExpressionTerms,
  reconcileFilterExpression
} from '../types/filterExpression';
import { hasPagesInMultipleFolders } from './folderFilterUtils';

interface UseDisplayFiltersOptions {
  filters: IFilter[];
  graph: Graph;
  graphUpdateTrigger: number;
  hiddenPages: Set<string>;
  selectedPages: Set<string>;
  selectionShowTitles: boolean;
  siteSlug: string;
  soloPages: Set<string>;
}

const createPageIdSelector = (pageIds: Set<string>, name: string): IPageSelector => ({
  id: `page-id-selector-${name}`,
  name,
  type: 'normal',
  select: () => new Set(pageIds)
});

export function useDisplayFilters({
  filters,
  graph,
  graphUpdateTrigger,
  hiddenPages,
  selectedPages,
  selectionShowTitles,
  siteSlug,
  soloPages
}: UseDisplayFiltersOptions) {
  const [expressionState, setExpressionState] = useState<{
    siteSlug: string;
    expression: FilterExpression | null;
  }>({ siteSlug, expression: null });

  const combinedFilters = useMemo(() => {
    // The graph object is mutated in place, so this revision keeps folder availability current.
    void graphUpdateTrigger;
    const result: IFilter[] = [...filters];
    const folderFilter = filters.find(filter => filter.isFolderFilter);

    if (folderFilter?.enabled && hasPagesInMultipleFolders(graph.getAllPages())) {
      Object.entries(folderFilter.folderStates || {}).forEach(([folderPath, state]) => {
        if (!state.showTitles && !state.isSolo && !state.isHidden) return;
        result.push({
          id: `folder-filter-${folderPath || 'root'}`,
          name: folderPath ? `Folder: ${folderPath}` : 'Folder: Root',
          pageSelectors: [createFolderPageSelector(folderPath)],
          selectorApplicationCriteria: 'union',
          actions: state.showTitles ? [{ type: 'show_titles' }] : [],
          enabled: true,
          isSolo: state.isSolo,
          isHidden: state.isHidden,
          hideFromFilterList: true
        });
      });
    }

    if (soloPages.size > 0) {
      result.push({
        id: 'selection-solo-filter',
        name: 'Selection Solo',
        pageSelectors: [createPageIdSelector(soloPages, 'solo-pages')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: true,
        isHidden: false,
        hideFromFilterList: true
      });
    }

    if (selectionShowTitles && selectedPages.size > 0) {
      result.push({
        id: 'selection-titles-filter',
        name: 'Selection Titles',
        pageSelectors: [createPageIdSelector(selectedPages, 'title-pages')],
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

    if (hiddenPages.size > 0) {
      result.push({
        id: 'selection-hide-filter',
        name: 'Hidden Selection',
        pageSelectors: [createPageIdSelector(hiddenPages, 'hidden-pages')],
        selectorApplicationCriteria: 'union',
        actions: [],
        enabled: true,
        isSolo: false,
        isHidden: true,
        hideFromFilterList: true
      });
    }

    return result;
  }, [filters, graph, graphUpdateTrigger, hiddenPages, selectedPages, selectionShowTitles, soloPages]);

  const activeTerms = useMemo(() => getActiveFilterExpressionTerms(combinedFilters), [combinedFilters]);
  const storedExpression = expressionState.siteSlug === siteSlug ? expressionState.expression : null;
  const effectiveExpression = useMemo(
    () => reconcileFilterExpression(storedExpression, activeTerms),
    [activeTerms, storedExpression]
  );

  useEffect(() => {
    if (effectiveExpression !== storedExpression) {
      setExpressionState({ siteSlug, expression: effectiveExpression });
    }
  }, [effectiveExpression, siteSlug, storedExpression]);

  const setExpression = useCallback((expression: FilterExpression) => {
    setExpressionState({ siteSlug, expression });
  }, [siteSlug]);

  return { combinedFilters, effectiveExpression, setExpression };
}
