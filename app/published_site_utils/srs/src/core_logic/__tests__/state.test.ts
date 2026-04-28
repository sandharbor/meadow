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
import { burySiblingCards, getRuntimeCards, loadStore, resetCardState } from '../state';
import type { SrsCardDefinition, SrsClock } from '../types';

const now = new Date('2026-03-11T12:00:00.000Z');
const clock: SrsClock = { now: () => now };

const cards: SrsCardDefinition[] = [
  {
    id: 'one',
    siteGuid: 'site1234',
    pageId: 'page.html',
    sourceId: 'source-1',
    siblingGroupKey: 'group-1',
    format: 'single-bidirectional',
    direction: 'forward',
    promptHtml: 'Front',
    answerHtml: 'Back',
    searchText: 'Front',
    contextPath: ['Heading'],
  },
  {
    id: 'two',
    siteGuid: 'site1234',
    pageId: 'page.html',
    sourceId: 'source-1',
    siblingGroupKey: 'group-1',
    format: 'single-bidirectional',
    direction: 'reverse',
    promptHtml: 'Back',
    answerHtml: 'Front',
    searchText: 'Back',
    contextPath: ['Heading'],
  },
];

describe('state helpers', () => {
  it('buries siblings until the next day', () => {
    const store = loadStore('site1234', {
      load: () => null,
      save: () => undefined,
      clear: () => undefined,
    });
    getRuntimeCards(cards, store, clock);
    burySiblingCards(cards, store, 'one', clock);
    expect(store.cards.two.buriedUntil).toBe('2026-03-12T00:00:00.000Z');
  });

  it('resets card progress to new', () => {
    const store = loadStore('site1234', {
      load: () => null,
      save: () => undefined,
      clear: () => undefined,
    });
    getRuntimeCards(cards, store, clock);
    store.cards.one.reviewCount = 7;
    resetCardState('one', store, now);
    expect(store.cards.one.reviewCount).toBe(0);
    expect(store.cards.one.dueAt).toBe(now.toISOString());
  });
});
