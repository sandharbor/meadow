/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { IFilter } from '../types/filters.js';
import { createSearchByTitleSelector, createOutlinkDiscrepancySelector, createInlinkDiscrepancySelector } from './filterSelectors.js';
import { readEditorView, writeEditorView } from '../../../../shared/utils/editorViewStorage.js';

type FilterView = Pick<IFilter, 'enabled' | 'isSolo' | 'isHidden' | 'actions' | 'thresholdValue' | 'folderStates' | 'nodeTypeStates'> & { searchInput?: string };

export function restoreFilterViews(bundleSlug: string, mode: 'curation' | 'sourcing', filters: IFilter[]): IFilter[] {
  const saved = readEditorView<Record<string, FilterView>>(bundleSlug, mode, 'filters', {});
  return filters.map(filter => {
    const view = saved[filter.id];
    if (!view) return filter;
    const { searchInput, ...presentation } = view;
    const selectors = filter.id === 'search-by-title-filter' ? [createSearchByTitleSelector(searchInput ?? '')]
      : filter.id === 'outlink-gap-filter' && view.thresholdValue !== undefined ? [createOutlinkDiscrepancySelector(view.thresholdValue)]
      : filter.id === 'inlink-gap-filter' && view.thresholdValue !== undefined ? [createInlinkDiscrepancySelector(view.thresholdValue)] : filter.bundleNodeSelectors;
    const actions = filter.group === 'source-changes'
      ? [...filter.actions.filter(action => action.type !== 'show_titles'), ...presentation.actions.filter(action => action.type === 'show_titles')]
      : [...presentation.actions.filter(action => action.type !== 'mark_sensitive'), ...filter.actions.filter(action => action.type === 'mark_sensitive')];
    return { ...filter, ...presentation, ...(filter.group === 'source-changes' && { enabled: true }), actions, bundleNodeSelectors: selectors };
  });
}

export function saveFilterViews(bundleSlug: string, mode: 'curation' | 'sourcing', filters: IFilter[]) {
  const previous = readEditorView<Record<string, FilterView>>(bundleSlug, mode, 'filters', {});
  const changed = Object.fromEntries(filters.map(filter => [filter.id, { enabled: filter.enabled, isSolo: filter.isSolo, isHidden: filter.isHidden,
    actions: filter.actions, thresholdValue: filter.thresholdValue, folderStates: filter.folderStates, nodeTypeStates: filter.nodeTypeStates,
    searchInput: filter.bundleNodeSelectors[0]?.searchInput }]));
  writeEditorView(bundleSlug, mode, 'filters', { ...previous, ...changed });
}
