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

import { makeStorageKey } from './persistence';
import type {
  SrsCardDefinition,
  SrsCardState,
  SrsClock,
  SrsPersistence,
  SrsRuntimeCard,
  SrsStoreData,
} from './types';

const DEFAULT_INTERVAL_MS = 0;
const DEFAULT_EASE_FACTOR = 2.5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createSystemClock(): SrsClock {
  return {
    now: () => new Date(),
  };
}

export function emptyStore(): SrsStoreData {
  return {
    version: 1,
    cards: {},
  };
}

export function loadStore(siteGuid: string, persistence: SrsPersistence): SrsStoreData {
  const raw = persistence.load(makeStorageKey(siteGuid));
  if (!raw) {
    return emptyStore();
  }

  try {
    const parsed = JSON.parse(raw) as SrsStoreData;
    if (parsed.version !== 1 || typeof parsed.cards !== 'object' || parsed.cards === null) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveStore(siteGuid: string, persistence: SrsPersistence, store: SrsStoreData): void {
  persistence.save(makeStorageKey(siteGuid), JSON.stringify(store));
}

export function clearStore(siteGuid: string, persistence: SrsPersistence): void {
  persistence.clear(makeStorageKey(siteGuid));
}

export function ensureCardState(store: SrsStoreData, card: SrsCardDefinition, now: Date): SrsCardState {
  const existing = store.cards[card.id];
  if (existing) {
    return existing;
  }

  const created: SrsCardState = {
    cardId: card.id,
    intervalMs: DEFAULT_INTERVAL_MS,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueAt: now.toISOString(),
    reviewCount: 0,
    lapseCount: 0,
  };

  store.cards[card.id] = created;
  return created;
}

export function getRuntimeCards(
  cards: SrsCardDefinition[],
  store: SrsStoreData,
  clock: SrsClock,
): SrsRuntimeCard[] {
  const now = clock.now();
  return cards.map((card) => {
    const state = ensureCardState(store, card, now);
    if (state.buriedUntil && new Date(state.buriedUntil).getTime() <= now.getTime()) {
      delete state.buriedUntil;
    }
    const dueInMs = new Date(state.dueAt).getTime() - now.getTime();
    const buried = !!state.buriedUntil && new Date(state.buriedUntil).getTime() > now.getTime();
    return {
      definition: card,
      state,
      due: dueInMs <= 0,
      dueInMs,
      newCard: state.reviewCount === 0,
      buried,
    };
  });
}

export function burySiblingCards(
  cards: SrsCardDefinition[],
  store: SrsStoreData,
  reviewedCardId: string,
  clock: SrsClock,
): void {
  const now = clock.now();
  const reviewedCard = cards.find((card) => card.id === reviewedCardId);
  if (!reviewedCard) {
    return;
  }

  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);

  for (const card of cards) {
    if (card.id === reviewedCardId || card.siblingGroupKey !== reviewedCard.siblingGroupKey) {
      continue;
    }
    const state = ensureCardState(store, card, now);
    const dueAtMs = new Date(state.dueAt).getTime();
    if (dueAtMs <= now.getTime() + DAY_MS || state.reviewCount === 0) {
      state.buriedUntil = nextMidnight.toISOString();
    }
  }
}

export function resetCardState(cardId: string, store: SrsStoreData, now: Date): void {
  store.cards[cardId] = {
    cardId,
    intervalMs: DEFAULT_INTERVAL_MS,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueAt: now.toISOString(),
    reviewCount: 0,
    lapseCount: 0,
  };
}
