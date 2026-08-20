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

import type { CustomFilterConfig } from '../../../../../../shared_code/types/customFilters.js';
import type {
  GraphFilterApplication,
  GraphFilterCatalog,
  GraphFilterCombination,
  GraphFilterDescriptor,
} from '../../../../../../shared_code/types/graphInspection.js';
import { Graph } from '../../../../../../shared_code/types/graph.js';
import {
  createCustomBundleNodeSelector,
  type IBundleNodeSelector,
} from '../../../../../../shared_code/utils/filterSelectors.js';
import {
  BUILT_IN_GRAPH_FILTER_DEFINITIONS,
  flattenBuiltInGraphFilterDefinitions,
} from '../../../../../../shared_code/utils/builtInGraphFilters.js';
import {
  createDefaultFilterExpression,
  evaluateFilterExpression,
  type ActiveFilterExpressionTerm,
  type FilterExpression,
  type FilterExpressionOperator,
} from '../../../../../../shared_code/types/filterExpression.js';

interface ExecutableFilter {
  id: string;
  selectorApplicationCriteria: 'union' | 'intersection';
  selectors: IBundleNodeSelector[];
}

function customFilterDescriptor(filter: CustomFilterConfig): GraphFilterDescriptor {
  return {
    id: `custom-${filter.id}`,
    name: filter.name,
    description: filter.note ?? 'Custom graph filter.',
    scope: filter.scope,
    kind: 'filter',
    enabled: filter.enabled,
    applicable: true,
    selectorApplicationCriteria: filter.selectorApplicationCriteria,
    selectors: filter.selectors,
    actions: filter.actions,
  };
}

export function getGraphFilterCatalog(
  bundleSlug: string,
  customFilters: CustomFilterConfig[],
): GraphFilterCatalog {
  return {
    bundleSlug,
    filters: [
      ...BUILT_IN_GRAPH_FILTER_DEFINITIONS.map(definition => definition.descriptor),
      ...customFilters.map(customFilterDescriptor),
    ],
  };
}

function executableFilters(customFilters: CustomFilterConfig[]): Map<string, ExecutableFilter> {
  const builtInFilters = flattenBuiltInGraphFilterDefinitions()
    .filter(definition => definition.descriptor.applicable && definition.createSelectors)
    .map(definition => ({
      id: definition.descriptor.id,
      selectorApplicationCriteria: definition.descriptor.selectorApplicationCriteria ?? 'union',
      selectors: definition.createSelectors?.() ?? [],
    }));
  return new Map([
    ...builtInFilters.map(filter => [filter.id, filter] as const),
    ...customFilters.map(filter => [
      `custom-${filter.id}`,
      {
        id: `custom-${filter.id}`,
        selectorApplicationCriteria: filter.selectorApplicationCriteria,
        selectors: filter.selectors.map(selector => createCustomBundleNodeSelector(selector)),
      },
    ] as const),
  ]);
}

function matchingNodeKeys(filter: ExecutableFilter, graph: Graph): Set<string> {
  const selectorResults = filter.selectors.map(selector => selector.select(graph));
  const matches = new Set<string>();
  for (const node of graph.getAllNodes()) {
    const selected = filter.selectorApplicationCriteria === 'union'
      ? selectorResults.some(result => result.has(node.bundleNodeKey))
      : selectorResults.every(result => result.has(node.bundleNodeKey));
    if (selected) matches.add(node.bundleNodeKey);
  }
  return matches;
}

function activeTerms(applications: GraphFilterApplication[]): ActiveFilterExpressionTerm[] {
  return applications.map(application => ({
    filterId: application.filterId,
    mode: application.mode === 'solo' ? 'solo' : 'hide',
  }));
}

function explicitExpression(
  applications: GraphFilterApplication[],
  combine: Exclude<GraphFilterCombination, 'default'>,
): FilterExpression {
  const children: FilterExpression[] = applications.map(application => ({
    type: 'filter',
    filterId: application.filterId,
    mode: application.mode === 'solo' ? 'solo' : 'hide',
  }));
  if (children.length === 1) return children[0];
  return {
    type: 'group',
    id: 'cli-filter-expression',
    operator: combine as FilterExpressionOperator,
    children,
  };
}

export function selectGraphNodeKeys(
  graph: Graph,
  customFilters: CustomFilterConfig[],
  applications: GraphFilterApplication[],
  combine: GraphFilterCombination,
): Set<string> {
  const allBundleNodeKeys = new Set(graph.getAllNodes().map(node => node.bundleNodeKey));
  if (applications.length === 0) return allBundleNodeKeys;

  const availableFilters = executableFilters(customFilters);
  const filterMatches = new Map<string, Set<string>>();
  for (const application of applications) {
    const filter = availableFilters.get(application.filterId);
    if (!filter) {
      throw new Error(`Unknown or parameterized filter '${application.filterId}'. Run 'meadow bundle filters' to list applicable filter IDs.`);
    }
    if (!filterMatches.has(filter.id)) {
      filterMatches.set(filter.id, matchingNodeKeys(filter, graph));
    }
  }

  const terms = activeTerms(applications);
  const expression = combine === 'default'
    ? createDefaultFilterExpression(terms)
    : explicitExpression(applications, combine);
  return evaluateFilterExpression(expression, terms, filterMatches, allBundleNodeKeys);
}

/**
 * Effective sensitivity is source sensitivity plus every enabled custom filter
 * that applies a mark-sensitive action. This is the same product rule used by
 * curation presentation and bulk tracking; callers do not infer sensitivity
 * from filter names or fixture knowledge.
 */
export function selectEffectivelySensitiveNodeKeys(
  graph: Graph,
  customFilters: CustomFilterConfig[],
): Set<string> {
  const result = new Set(
    graph.getAllNodes()
      .filter(node => node.sensitive === true)
      .map(node => node.bundleNodeKey),
  );
  for (const filter of customFilters) {
    if (!filter.enabled || !filter.actions.some(action => action.type === 'mark_sensitive')) continue;
    const selectors = filter.selectors.map(selector => createCustomBundleNodeSelector(selector));
    const selected = selectors.map(selector => selector.select(graph));
    for (const node of graph.getAllNodes()) {
      const matches = filter.selectorApplicationCriteria === 'union'
        ? selected.some(keys => keys.has(node.bundleNodeKey))
        : selected.every(keys => keys.has(node.bundleNodeKey));
      if (matches) result.add(node.bundleNodeKey);
    }
  }
  return result;
}
