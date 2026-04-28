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
import { collectWaypoints } from '../timeTravel';
import type { SrsRuntimeCard } from '../types';

const runtimeCard: SrsRuntimeCard = {
  definition: {
    id: 'card-1',
    siteGuid: 'site1234',
    pageId: 'page.html',
    sourceId: 'source-1',
    siblingGroupKey: 'group-1',
    format: 'single-basic',
    direction: 'forward',
    promptHtml: 'Prompt',
    answerHtml: 'Answer',
    searchText: 'Prompt',
    contextPath: [],
  },
  state: {
    cardId: 'card-1',
    intervalMs: 60 * 60 * 1000,
    easeFactor: 2.5,
    dueAt: '2026-03-11T13:00:00.000Z',
    reviewCount: 1,
    lapseCount: 0,
  },
  due: false,
  dueInMs: 60 * 60 * 1000,
  newCard: false,
  buried: false,
};

describe('collectWaypoints', () => {
  it('creates before and after waypoints around due time', () => {
    const waypoints = collectWaypoints([runtimeCard], new Date('2026-03-11T12:00:00.000Z'));
    expect(waypoints.map((waypoint) => waypoint.label)).toContain('1 minute before "Prompt" is due');
    expect(waypoints.map((waypoint) => waypoint.label)).toContain('"Prompt" becomes due');
    expect(waypoints.map((waypoint) => waypoint.label)).toContain('1 minute after "Prompt" is due');
  });
});
