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
import { createMemoryPersistence } from '../core_logic';
import type { SrsClock } from '../core_logic';
import { initializeMeadowSrs } from '../ui/controller';

/**
 * Virtual clock for time-travel tests.
 */
class TestClock implements SrsClock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function seedStore(cards: Record<string, { intervalMs: number; dueAt: string; reviewCount: number }>) {
  const storeCards: Record<string, unknown> = {};
  for (const [id, data] of Object.entries(cards)) {
    storeCards[id] = {
      cardId: id,
      intervalMs: data.intervalMs,
      easeFactor: 2.5,
      dueAt: data.dueAt,
      reviewCount: data.reviewCount,
      lapseCount: 0,
    };
  }
  return { version: 1, cards: storeCards };
}

function getPageBadgeTexts(): string[] {
  const pageTab = document.querySelector<HTMLButtonElement>('.meadow-srs-overlay__tab[data-scope="page"]');
  if (!pageTab) return [];
  return Array.from(pageTab.querySelectorAll('.meadow-srs-tab-badge'))
    .map((el) => el.textContent ?? '');
}

describe('due vs new card separation', () => {
  it('new (never-reviewed) cards do not appear in the overlay due list', () => {
    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-basic-001" kind="basic">
          <meadow-srs-prompt>What is 2+2?</meadow-srs-prompt>
          <meadow-srs-answer>4</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="dn-basic-002" kind="basic">
          <meadow-srs-prompt>What is 3+3?</meadow-srs-prompt>
          <meadow-srs-answer>6</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-1',
      pageId: 'test/new-cards.html',
      persistence: createMemoryPersistence(),
    });

    // In due mode, new cards should NOT appear
    expect(controller.getReviewMode()).toBe('due');
    expect(controller.getVisibleReviewCards()).toHaveLength(0);

    // In cram mode, all cards appear
    controller.setReviewMode('cram');
    expect(controller.getVisibleReviewCards()).toHaveLength(2);

    controller.destroy();
  });

  it('previously-reviewed due cards appear in overlay; new cards do not', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-mix-001" kind="basic">
          <meadow-srs-prompt>Reviewed card</meadow-srs-prompt>
          <meadow-srs-answer>Reviewed answer</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="dn-mix-002" kind="basic">
          <meadow-srs-prompt>New card</meadow-srs-prompt>
          <meadow-srs-answer>New answer</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // Seed: one card reviewed (due now), one card never reviewed
    const store = seedStore({
      'dn-mix-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() - HOUR).toISOString(),
        reviewCount: 1,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-2',
      pageId: 'test/mix.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-2': JSON.stringify(store) }),
    });

    expect(controller.getReviewMode()).toBe('due');
    const visible = controller.getVisibleReviewCards();
    expect(visible).toHaveLength(1);
    expect(visible[0].definition.id).toBe('dn-mix-001');
    expect(visible[0].newCard).toBe(false);
    expect(visible[0].due).toBe(true);

    controller.destroy();
  });

  it('after reviewing all cards and time-traveling, due card is not counted as new', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-tt-001" kind="basic">
          <meadow-srs-prompt>Capital of Japan</meadow-srs-prompt>
          <meadow-srs-answer>Tokyo</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // Card was reviewed, due in 1 day
    const store = seedStore({
      'dn-tt-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() + DAY).toISOString(),
        reviewCount: 1,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-3',
      pageId: 'test/time-travel.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-3': JSON.stringify(store) }),
    });

    // Before time travel: not yet due, not new
    expect(controller.getVisibleReviewCards()).toHaveLength(0);
    const rt = controller.getRuntimeCards();
    expect(rt).toHaveLength(1);
    expect(rt[0].due).toBe(false);
    expect(rt[0].newCard).toBe(false);

    // Time travel 2 days forward
    clock.advance(2 * DAY);
    controller.refresh();

    const afterTravel = controller.getRuntimeCards();
    expect(afterTravel).toHaveLength(1);
    expect(afterTravel[0].due).toBe(true);
    expect(afterTravel[0].newCard).toBe(false);

    // Should appear as due in overlay
    expect(controller.getVisibleReviewCards()).toHaveLength(1);

    controller.destroy();
  });

  it('tab badges show separate due and new counts', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-badge-001" kind="basic">
          <meadow-srs-prompt>Due card</meadow-srs-prompt>
          <meadow-srs-answer>Due answer</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="dn-badge-002" kind="basic">
          <meadow-srs-prompt>New card A</meadow-srs-prompt>
          <meadow-srs-answer>New answer A</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="dn-badge-003" kind="basic">
          <meadow-srs-prompt>New card B</meadow-srs-prompt>
          <meadow-srs-answer>New answer B</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // 1 reviewed+due card, 2 never-reviewed cards
    const store = seedStore({
      'dn-badge-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() - HOUR).toISOString(),
        reviewCount: 3,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-4',
      pageId: 'test/badges.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-4': JSON.stringify(store) }),
    });

    // Open the overlay to render badges
    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    const pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('1 due');
    expect(pageBadges).toContain('2 new');

    controller.destroy();
  });

  it('tab badges show 0 due and 0 new after reviewing all cards (no time travel)', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-zero-001" kind="basic">
          <meadow-srs-prompt>Only card</meadow-srs-prompt>
          <meadow-srs-answer>Only answer</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // Card was reviewed, not yet due again (due in 1 day)
    const store = seedStore({
      'dn-zero-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() + DAY).toISOString(),
        reviewCount: 1,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-5',
      pageId: 'test/zero.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-5': JSON.stringify(store) }),
    });

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    const pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('0 due');
    // No "new" badge when count is 0
    expect(pageBadges.every((t) => !t.includes('new'))).toBe(true);

    controller.destroy();
  });

  it('after time travel, badge shows due count without new for reviewed cards', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-travel-001" kind="basic">
          <meadow-srs-prompt>Card A</meadow-srs-prompt>
          <meadow-srs-answer>Answer A</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="dn-travel-002" kind="basic">
          <meadow-srs-prompt>Card B</meadow-srs-prompt>
          <meadow-srs-answer>Answer B</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // Both reviewed, both due in 1 day
    const store = seedStore({
      'dn-travel-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() + DAY).toISOString(),
        reviewCount: 2,
      },
      'dn-travel-002': {
        intervalMs: 3 * DAY,
        dueAt: new Date(now.getTime() + 3 * DAY).toISOString(),
        reviewCount: 5,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-6',
      pageId: 'test/travel-badge.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-6': JSON.stringify(store) }),
    });

    // Open overlay
    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    // Initially: 0 due, 0 new
    let pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('0 due');
    expect(pageBadges.every((t) => !t.includes('new'))).toBe(true);

    // Time travel 2 days: card A becomes due, card B still not due
    clock.advance(2 * DAY);
    controller.refresh();

    pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('1 due');
    // Crucially: no "new" badge — both cards were previously reviewed
    expect(pageBadges.every((t) => !t.includes('new'))).toBe(true);

    // Time travel 2 more days: both cards now due
    clock.advance(2 * DAY);
    controller.refresh();

    pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('2 due');
    expect(pageBadges.every((t) => !t.includes('new'))).toBe(true);

    controller.destroy();
  });

  it('bidirectional card: unreviewed reverse direction counts as new, not due', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-bidi-001" kind="bidirectional">
          <meadow-srs-prompt>HTTP</meadow-srs-prompt>
          <meadow-srs-answer>HyperText Transfer Protocol</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    // Only the forward direction was reviewed; reverse never touched
    const store = seedStore({
      'dn-bidi-001:forward': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() + DAY).toISOString(),
        reviewCount: 1,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-7',
      pageId: 'test/bidi.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-7': JSON.stringify(store) }),
    });

    const rt = controller.getRuntimeCards();
    expect(rt).toHaveLength(2);

    const forward = rt.find((c) => c.definition.id === 'dn-bidi-001:forward')!;
    const reverse = rt.find((c) => c.definition.id === 'dn-bidi-001:reverse')!;

    expect(forward.newCard).toBe(false);
    expect(forward.due).toBe(false);

    expect(reverse.newCard).toBe(true);
    // Reverse is new — it should NOT appear in due overlay
    expect(controller.getVisibleReviewCards()).toHaveLength(0);

    // Open overlay to check badges
    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    let pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('0 due');
    expect(pageBadges).toContain('1 new');

    // Time travel: forward becomes due
    clock.advance(2 * DAY);
    controller.refresh();

    const visible = controller.getVisibleReviewCards();
    expect(visible).toHaveLength(1);
    expect(visible[0].definition.id).toBe('dn-bidi-001:forward');

    pageBadges = getPageBadgeTexts();
    expect(pageBadges).toContain('1 due');
    // Reverse is still new (never reviewed), should show as new NOT due
    expect(pageBadges).toContain('1 new');

    controller.destroy();
  });

  it('empty state message mentions new cards when due list is empty but new cards exist', () => {
    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-empty-001" kind="basic">
          <meadow-srs-prompt>A new card</meadow-srs-prompt>
          <meadow-srs-answer>An answer</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-8',
      pageId: 'test/empty-msg.html',
      persistence: createMemoryPersistence(),
    });

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    const subtitle = document.querySelector<HTMLElement>('[data-role="overlay-subtitle"]');
    expect(subtitle?.textContent).toContain('new');
    expect(subtitle?.textContent).toContain('available in the material');

    controller.destroy();
  });

  it('empty state message suggests Cram when no new and no due cards exist', () => {
    const now = new Date();
    const clock = new TestClock(now);

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-cram-001" kind="basic">
          <meadow-srs-prompt>Reviewed, not due</meadow-srs-prompt>
          <meadow-srs-answer>Answer</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const store = seedStore({
      'dn-cram-001': {
        intervalMs: DAY,
        dueAt: new Date(now.getTime() + DAY).toISOString(),
        reviewCount: 1,
      },
    });

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-9',
      pageId: 'test/cram-msg.html',
      clock,
      persistence: createMemoryPersistence({ 'meadow:srs:dn-test-9': JSON.stringify(store) }),
    });

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    const subtitle = document.querySelector<HTMLElement>('[data-role="overlay-subtitle"]');
    expect(subtitle?.textContent).toContain('Cram');
    expect(subtitle?.textContent).not.toContain('new');

    controller.destroy();
  });

  it('new cards still auto-expand inline on the page', () => {
    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="dn-inline-001" kind="basic">
          <meadow-srs-prompt>Inline new card</meadow-srs-prompt>
          <meadow-srs-answer>Inline answer</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'dn-test-10',
      pageId: 'test/inline-expand.html',
      persistence: createMemoryPersistence(),
    });

    // New cards should be expanded inline (not dormant)
    const card = document.querySelector('.meadow-srs-card');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('meadow-srs-card--dormant')).toBe(false);
    // Should have the "Show answer" button visible inline
    expect(document.querySelector('.meadow-srs-button')?.textContent).toBe('Show answer');

    controller.destroy();
  });
});
