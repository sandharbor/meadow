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
import { scheduleNextReview } from '../scheduler';
import type { SrsCardState } from '../types';

function makeState(overrides: Partial<SrsCardState> = {}): SrsCardState {
  return {
    cardId: 'card-1',
    intervalMs: 0,
    easeFactor: 2.5,
    dueAt: '2026-03-11T00:00:00.000Z',
    reviewCount: 0,
    lapseCount: 0,
    ...overrides,
  };
}

describe('scheduleNextReview', () => {
  const now = new Date('2026-03-11T12:00:00.000Z');

  it('keeps new cards close when rated again', () => {
    const next = scheduleNextReview(makeState(), 'again', now);
    expect(next.intervalMs).toBe(10 * 60 * 1000);
    expect(next.lapseCount).toBe(1);
  });

  it('graduates new cards to days for good/easy', () => {
    const good = scheduleNextReview(makeState(), 'good', now);
    const easy = scheduleNextReview(makeState(), 'easy', now);
    expect(good.intervalMs).toBeGreaterThanOrEqual(Math.floor(2 * 24 * 60 * 60 * 1000 * 0.95));
    expect(good.intervalMs).toBeLessThanOrEqual(Math.ceil(2 * 24 * 60 * 60 * 1000 * 1.05));
    expect(easy.intervalMs).toBeGreaterThan(good.intervalMs);
  });

  it('grows review cards based on ease factor', () => {
    const previous = makeState({
      intervalMs: 3 * 24 * 60 * 60 * 1000,
      reviewCount: 4,
    });
    const next = scheduleNextReview(previous, 'good', now);
    const unfuzzed = 3 * 24 * 60 * 60 * 1000 * 2.5;
    expect(next.intervalMs).toBeGreaterThanOrEqual(Math.floor(unfuzzed * 0.95));
    expect(next.intervalMs).toBeLessThanOrEqual(Math.ceil(unfuzzed * 1.05));
    expect(next.reviewCount).toBe(5);
  });
});
