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

import { describe, expect, it } from 'vitest';
import {
  ActiveFilterExpressionTerm,
  FilterExpression,
  appendFilterExpressionGroup,
  createDefaultFilterExpression,
  evaluateFilterExpression,
  isDefaultFilterExpression,
  moveFilterExpressionNode,
  moveFilterExpressionNodeOnto,
  reconcileFilterExpression,
  setFilterExpressionOperator,
  ungroupFilterExpression
} from '../../../../../src/areas/site/curation/types/filterExpression';

const allPages = new Set(['a', 'b', 'c', 'd']);
const matches = new Map<string, Set<string>>([
  ['alpha', new Set(['a', 'b'])],
  ['beta', new Set(['b', 'c'])],
  ['charlie', new Set(['b', 'd'])]
]);

const solo = (filterId: string): ActiveFilterExpressionTerm => ({ filterId, mode: 'solo' });
const hide = (filterId: string): ActiveFilterExpressionTerm => ({ filterId, mode: 'hide' });

describe('filter expression language', () => {
  it('represents default solos as a union and subtracts hidden filters', () => {
    const terms = [solo('alpha'), solo('beta'), hide('charlie')];
    const expression = createDefaultFilterExpression(terms);

    expect(evaluateFilterExpression(expression, terms, matches, allPages)).toEqual(new Set(['a', 'c']));
  });

  it('starts from all pages when only hide terms are active', () => {
    const terms = [hide('alpha'), hide('charlie')];
    const expression = createDefaultFilterExpression(terms);

    expect(evaluateFilterExpression(expression, terms, matches, allPages)).toEqual(new Set(['c']));
  });

  it('detects a customized active expression while ignoring commutative ordering and inactive terms', () => {
    const terms = [solo('alpha'), solo('beta')];
    const defaultExpression = createDefaultFilterExpression(terms);
    if (!defaultExpression || defaultExpression.type !== 'group') throw new Error('Expected a group expression');

    expect(isDefaultFilterExpression(defaultExpression, terms)).toBe(true);
    expect(isDefaultFilterExpression({
      ...defaultExpression,
      children: [...defaultExpression.children].reverse()
    }, terms)).toBe(true);
    expect(isDefaultFilterExpression({
      ...defaultExpression,
      operator: 'intersection'
    }, terms)).toBe(false);

    const retainedInactiveTerm = {
      ...defaultExpression,
      children: [...defaultExpression.children, { type: 'filter' as const, filterId: 'charlie', mode: 'solo' as const }]
    };
    expect(isDefaultFilterExpression(retainedInactiveTerm, terms)).toBe(true);

    const defaultSoloAndHideExpression = createDefaultFilterExpression([...terms, hide('charlie')]);
    if (!defaultSoloAndHideExpression) throw new Error('Expected a mixed expression');
    expect(isDefaultFilterExpression(defaultSoloAndHideExpression, terms)).toBe(true);
  });

  it('evaluates nested union, intersection, and difference groups as parentheses', () => {
    const expression: FilterExpression = {
      type: 'group',
      id: 'outer',
      operator: 'difference',
      children: [
        {
          type: 'group',
          id: 'inner',
          operator: 'intersection',
          children: [
            {
              type: 'group',
              id: 'either',
              operator: 'union',
              children: [
                { type: 'filter', filterId: 'alpha', mode: 'solo' },
                { type: 'filter', filterId: 'beta', mode: 'solo' }
              ]
            },
            { type: 'filter', filterId: 'charlie', mode: 'solo' }
          ]
        },
        { type: 'filter', filterId: 'beta', mode: 'hide' }
      ]
    };
    const terms = [solo('alpha'), solo('beta'), solo('charlie'), hide('beta')];

    expect(evaluateFilterExpression(expression, terms, matches, allPages)).toEqual(new Set(['b']));
  });

  it('skips disabled terms without removing them from their original position', () => {
    const originalTerms = [solo('alpha'), solo('beta'), hide('charlie')];
    const expression = createDefaultFilterExpression(originalTerms);
    if (!expression) throw new Error('Expected a default expression');

    const withoutAlpha = reconcileFilterExpression(expression, [solo('beta'), hide('charlie')]);
    expect(withoutAlpha).toBe(expression);
    expect(evaluateFilterExpression(withoutAlpha, [solo('beta'), hide('charlie')], matches, allPages))
      .toEqual(new Set(['c']));

    const restored = reconcileFilterExpression(withoutAlpha, originalTerms);
    expect(restored).toBe(expression);
    expect(evaluateFilterExpression(restored, originalTerms, matches, allPages)).toEqual(new Set(['a', 'c']));
  });

  it('unions a newly soloed filter with the current expression', () => {
    const customExpression: FilterExpression = {
      type: 'group',
      id: 'custom-intersection',
      operator: 'intersection',
      children: [
        { type: 'filter', filterId: 'alpha', mode: 'solo' },
        { type: 'filter', filterId: 'beta', mode: 'solo' }
      ]
    };
    const terms = [solo('alpha'), solo('beta'), solo('charlie')];
    const reconciled = reconcileFilterExpression(customExpression, terms);

    expect(reconciled?.type).toBe('group');
    expect(reconciled?.type === 'group' && reconciled.operator).toBe('union');
    expect(evaluateFilterExpression(reconciled, terms, matches, allPages)).toEqual(new Set(['b', 'd']));
  });

  it('subtracts a newly hidden filter from the current expression', () => {
    const expression = createDefaultFilterExpression([solo('alpha'), solo('beta')]);
    const terms = [solo('alpha'), solo('beta'), hide('charlie')];
    const reconciled = reconcileFilterExpression(expression, terms);

    expect(reconciled?.type === 'group' && reconciled.operator).toBe('intersection');
    expect(evaluateFilterExpression(reconciled, terms, matches, allPages)).toEqual(new Set(['a', 'c']));
  });

  it('supports adding, moving, changing, and ungrouping parenthesized groups', () => {
    const initial = createDefaultFilterExpression([solo('alpha'), solo('beta')]);
    if (!initial || initial.type !== 'group') throw new Error('Expected a group expression');

    const withGroup = appendFilterExpressionGroup(initial, initial.id, 'nested');
    const moved = moveFilterExpressionNode(withGroup, 'filter:solo:beta', 'nested', 0);
    const intersected = setFilterExpressionOperator(moved, 'nested', 'intersection');

    expect(intersected.type === 'group' && intersected.children[1]).toMatchObject({
      type: 'group',
      id: 'nested',
      operator: 'intersection',
      children: [{ filterId: 'beta' }]
    });
    expect(ungroupFilterExpression(intersected, 'nested')).toMatchObject({
      type: 'group',
      children: [{ filterId: 'alpha' }, { filterId: 'beta' }]
    });
  });

  it('reorders either of two sibling terms when one card is dropped on the other', () => {
    const initial = createDefaultFilterExpression([solo('alpha'), solo('beta')]);
    if (!initial || initial.type !== 'group') throw new Error('Expected a group expression');

    const betaFirst = moveFilterExpressionNodeOnto(
      initial,
      'filter:solo:alpha',
      'filter:solo:beta'
    );
    expect(betaFirst).toMatchObject({
      children: [{ filterId: 'beta' }, { filterId: 'alpha' }]
    });

    const alphaFirstAgain = moveFilterExpressionNodeOnto(
      betaFirst,
      'filter:solo:beta',
      'filter:solo:alpha'
    );
    expect(alphaFirstAgain).toMatchObject({
      children: [{ filterId: 'alpha' }, { filterId: 'beta' }]
    });
  });
});
