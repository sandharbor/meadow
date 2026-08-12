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

export type FilterExpressionMode = 'solo' | 'hide';
export type FilterExpressionOperator = 'union' | 'intersection' | 'difference';

export interface FilterExpressionTerm {
  type: 'filter';
  filterId: string;
  mode: FilterExpressionMode;
}

export interface FilterExpressionAllNodes {
  type: 'all';
}

export interface FilterExpressionGroup {
  type: 'group';
  id: string;
  operator: FilterExpressionOperator;
  children: FilterExpression[];
}

/**
 * Serializable intermediate representation for the visibility portion of the
 * filter UI. Group nodes are parentheses; their operator combines their child
 * page sets. A term's mode records which filter control activated it.
 */
export type FilterExpression = FilterExpressionTerm | FilterExpressionAllNodes | FilterExpressionGroup;

export interface ActiveFilterExpressionTerm {
  filterId: string;
  mode: FilterExpressionMode;
}

export interface FilterExpressionSource {
  id: string;
  enabled: boolean;
  isSolo: boolean;
  isHidden: boolean;
}

export const ALL_PAGES_EXPRESSION_ID = 'all-pages';

export function filterExpressionTermId(term: ActiveFilterExpressionTerm | FilterExpressionTerm): string {
  return `filter:${term.mode}:${term.filterId}`;
}

export function filterExpressionNodeId(expression: FilterExpression): string {
  if (expression.type === 'filter') return filterExpressionTermId(expression);
  if (expression.type === 'all') return ALL_PAGES_EXPRESSION_ID;
  return expression.id;
}

export function getActiveFilterExpressionTerms(filters: FilterExpressionSource[]): ActiveFilterExpressionTerm[] {
  return filters.flatMap(filter => {
    if (!filter.enabled) return [];
    const terms: ActiveFilterExpressionTerm[] = [];
    if (filter.isSolo) terms.push({ filterId: filter.id, mode: 'solo' });
    if (filter.isHidden) terms.push({ filterId: filter.id, mode: 'hide' });
    return terms;
  });
}

function asTerm(term: ActiveFilterExpressionTerm): FilterExpressionTerm {
  return { type: 'filter', filterId: term.filterId, mode: term.mode };
}

function combine(
  operator: FilterExpressionOperator,
  children: FilterExpression[],
  id: string
): FilterExpression {
  if (children.length === 1) return children[0];
  return { type: 'group', id, operator, children };
}

/** Builds the expression that exactly represents Meadow's basic solo/hide behavior. */
export function createDefaultFilterExpression(
  activeTerms: ActiveFilterExpressionTerm[]
): FilterExpression | null {
  const solos = activeTerms.filter(term => term.mode === 'solo').map(asTerm);
  const hides = activeTerms.filter(term => term.mode === 'hide').map(asTerm);

  if (solos.length === 0 && hides.length === 0) return null;

  const soloExpression = solos.length > 0
    ? combine('union', solos, 'filter-expression-solos')
    : null;
  const hideExpression = hides.length > 0
    ? combine('intersection', hides, 'filter-expression-hides')
    : null;
  if (!soloExpression) return hideExpression;
  if (!hideExpression) return soloExpression;

  return {
    type: 'group',
    id: 'filter-expression-visible',
    operator: 'intersection',
    children: [
      {
        type: 'group',
        id: 'filter-expression-hides',
        operator: 'intersection',
        children: hides
      },
      {
        type: 'group',
        id: 'filter-expression-solos',
        operator: 'union',
        children: solos
      }
    ]
  };
}

function comparableFilterExpression(
  expression: FilterExpression,
  activeTermIds: ReadonlySet<string>
): string | null {
  if (expression.type === 'filter') {
    const termId = filterExpressionTermId(expression);
    return activeTermIds.has(termId) ? `filter:${JSON.stringify(termId)}` : null;
  }
  if (expression.type === 'all') return 'all-pages';

  const children = expression.children
    .map(child => comparableFilterExpression(child, activeTermIds))
    .filter((child): child is string => child !== null);
  if (children.length === 0 && expression.children.length > 0) return null;
  if (children.length === 1) return children[0];
  if (expression.operator !== 'difference') children.sort();
  return `group:${expression.operator}:[${children.join(',')}]`;
}

/** Whether the active portion of an expression still matches basic Solo/Hide behavior. */
export function isDefaultFilterExpression(
  expression: FilterExpression,
  activeTerms: ActiveFilterExpressionTerm[]
): boolean {
  const defaultExpression = createDefaultFilterExpression(activeTerms);
  if (!defaultExpression) return true;
  const activeTermIds = new Set(activeTerms.map(filterExpressionTermId));
  return comparableFilterExpression(expression, activeTermIds)
    === comparableFilterExpression(defaultExpression, activeTermIds);
}

function collectTermIds(expression: FilterExpression | null, result = new Set<string>()): Set<string> {
  if (!expression) return result;
  if (expression.type === 'filter') {
    result.add(filterExpressionTermId(expression));
  } else if (expression.type === 'group') {
    expression.children.forEach(child => collectTermIds(child, result));
  }
  return result;
}

function collectTerms(
  expression: FilterExpression | null,
  result: ActiveFilterExpressionTerm[] = []
): ActiveFilterExpressionTerm[] {
  if (!expression) return result;
  if (expression.type === 'filter') {
    result.push({ filterId: expression.filterId, mode: expression.mode });
  } else if (expression.type === 'group') {
    expression.children.forEach(child => collectTerms(child, result));
  }
  return result;
}

function collectNodeIds(expression: FilterExpression | null, result = new Set<string>()): Set<string> {
  if (!expression) return result;
  result.add(filterExpressionNodeId(expression));
  if (expression.type === 'group') {
    expression.children.forEach(child => collectNodeIds(child, result));
  }
  return result;
}

export function createFilterExpressionGroupId(expression: FilterExpression, prefix = 'filter-expression-group'): string {
  const ids = collectNodeIds(expression);
  let suffix = 1;
  while (ids.has(`${prefix}-${suffix}`)) suffix += 1;
  return `${prefix}-${suffix}`;
}

function appendWithOperator(
  expression: FilterExpression,
  child: FilterExpression,
  operator: FilterExpressionOperator
): FilterExpression {
  if (expression.type === 'group' && expression.operator === operator) {
    return { ...expression, children: [...expression.children, child] };
  }
  return {
    type: 'group',
    id: createFilterExpressionGroupId(expression, `filter-expression-${operator}`),
    operator,
    children: [expression, child]
  };
}

/**
 * Adds newly activated terms without deleting inactive ones. That retention is
 * what lets a term return to the same group when its Solo/Hide control is
 * switched back on later.
 */
export function reconcileFilterExpression(
  expression: FilterExpression | null,
  activeTerms: ActiveFilterExpressionTerm[]
): FilterExpression | null {
  if (!expression) return createDefaultFilterExpression(activeTerms);

  const knownTermIds = collectTermIds(expression);
  const newTerms = activeTerms.filter(term => !knownTermIds.has(filterExpressionTermId(term)));
  if (newTerms.length === 0) return expression;

  const retainedTerms = collectTerms(expression);
  if (isDefaultFilterExpression(expression, retainedTerms)) {
    return createDefaultFilterExpression([...retainedTerms, ...newTerms]);
  }

  let next = expression;

  newTerms.forEach(term => {
    const termId = filterExpressionTermId(term);
    const termExpression = asTerm(term);
    if (term.mode === 'solo') {
      next = appendWithOperator(next, termExpression, 'union');
    } else {
      next = appendWithOperator(next, termExpression, 'intersection');
    }
    knownTermIds.add(termId);
  });

  return next;
}

function union(sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  sets.forEach(set => set.forEach(value => result.add(value)));
  return result;
}

function intersection(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  return new Set([...sets[0]].filter(value => sets.slice(1).every(set => set.has(value))));
}

/** Evaluates only active terms; inactive terms remain in the notation but are skipped. */
export function evaluateFilterExpression(
  expression: FilterExpression | null,
  activeTerms: ActiveFilterExpressionTerm[],
  filterMatches: ReadonlyMap<string, Set<string>>,
  allSiteNodeKeys: Set<string>
): Set<string> {
  if (!expression || activeTerms.length === 0) return new Set(allSiteNodeKeys);
  const activeTermIds = new Set(activeTerms.map(filterExpressionTermId));

  const evaluate = (node: FilterExpression): Set<string> | null => {
    if (node.type === 'all') return new Set(allSiteNodeKeys);
    if (node.type === 'filter') {
      if (!activeTermIds.has(filterExpressionTermId(node))) return null;
      const matches = new Set(filterMatches.get(node.filterId) || []);
      return node.mode === 'solo'
        ? matches
        : new Set([...allSiteNodeKeys].filter(siteNodeKey => !matches.has(siteNodeKey)));
    }

    if (node.operator === 'difference') {
      const childSets = node.children.map(evaluate).filter((set): set is Set<string> => set !== null);
      if (childSets.length === 0) return null;
      const result = new Set(childSets[0]);
      childSets.slice(1).forEach(set => set.forEach(value => result.delete(value)));
      return result;
    }

    const childSets = node.children.map(evaluate).filter((set): set is Set<string> => set !== null);
    if (childSets.length === 0) return null;
    return node.operator === 'union' ? union(childSets) : intersection(childSets);
  };

  return evaluate(expression) || new Set(allSiteNodeKeys);
}

function updateGroup(
  expression: FilterExpression,
  groupId: string,
  update: (group: FilterExpressionGroup) => FilterExpression
): FilterExpression {
  if (expression.type !== 'group') return expression;
  if (expression.id === groupId) return update(expression);
  return {
    ...expression,
    children: expression.children.map(child => updateGroup(child, groupId, update))
  };
}

export function setFilterExpressionOperator(
  expression: FilterExpression,
  groupId: string,
  operator: FilterExpressionOperator
): FilterExpression {
  return updateGroup(expression, groupId, group => ({ ...group, operator }));
}

export function appendFilterExpressionGroup(
  expression: FilterExpression,
  parentGroupId: string,
  groupId: string
): FilterExpression {
  return updateGroup(expression, parentGroupId, group => ({
    ...group,
    children: [...group.children, { type: 'group', id: groupId, operator: 'union', children: [] }]
  }));
}

function detachNode(
  expression: FilterExpression,
  nodeId: string
): { expression: FilterExpression | null; detached: FilterExpression | null } {
  if (filterExpressionNodeId(expression) === nodeId) {
    return { expression: null, detached: expression };
  }
  if (expression.type !== 'group') return { expression, detached: null };

  let detached: FilterExpression | null = null;
  const children: FilterExpression[] = [];
  expression.children.forEach(child => {
    if (detached) {
      children.push(child);
      return;
    }
    const result = detachNode(child, nodeId);
    detached = result.detached;
    if (result.expression) children.push(result.expression);
  });
  return { expression: { ...expression, children }, detached };
}

function findParentAndIndex(
  expression: FilterExpression,
  nodeId: string
): { parentGroupId: string; index: number } | null {
  if (expression.type !== 'group') return null;
  const index = expression.children.findIndex(child => filterExpressionNodeId(child) === nodeId);
  if (index >= 0) return { parentGroupId: expression.id, index };
  for (const child of expression.children) {
    const result = findParentAndIndex(child, nodeId);
    if (result) return result;
  }
  return null;
}

export function moveFilterExpressionNode(
  expression: FilterExpression,
  nodeId: string,
  targetGroupId: string,
  targetIndex: number
): FilterExpression {
  if (filterExpressionNodeId(expression) === nodeId) return expression;
  const sourcePosition = findParentAndIndex(expression, nodeId);
  const detached = detachNode(expression, nodeId);
  if (!detached.expression || !detached.detached) return expression;

  let targetFound = false;
  const moved = updateGroup(detached.expression, targetGroupId, group => {
    targetFound = true;
    const children = [...group.children];
    const adjustedIndex = sourcePosition?.parentGroupId === targetGroupId && sourcePosition.index < targetIndex
      ? targetIndex - 1
      : targetIndex;
    children.splice(Math.max(0, Math.min(adjustedIndex, children.length)), 0, detached.detached as FilterExpression);
    return { ...group, children };
  });
  return targetFound ? moved : expression;
}

/**
 * Makes an entire sibling card a useful drop target. Dropping the earlier
 * sibling on the later one moves it after the target; dropping the later
 * sibling on the earlier one moves it before the target.
 */
export function moveFilterExpressionNodeOnto(
  expression: FilterExpression,
  nodeId: string,
  targetNodeId: string
): FilterExpression {
  if (nodeId === targetNodeId) return expression;
  const sourcePosition = findParentAndIndex(expression, nodeId);
  const targetPosition = findParentAndIndex(expression, targetNodeId);
  if (!sourcePosition || !targetPosition) return expression;

  const targetIndex = sourcePosition.parentGroupId === targetPosition.parentGroupId
    && sourcePosition.index < targetPosition.index
    ? targetPosition.index + 1
    : targetPosition.index;
  return moveFilterExpressionNode(expression, nodeId, targetPosition.parentGroupId, targetIndex);
}

export function ungroupFilterExpression(
  expression: FilterExpression,
  groupId: string
): FilterExpression {
  if (expression.type !== 'group' || expression.id === groupId) return expression;
  return {
    ...expression,
    children: expression.children.flatMap(child => {
      if (child.type === 'group' && child.id === groupId) return child.children;
      return [ungroupFilterExpression(child, groupId)];
    })
  };
}
