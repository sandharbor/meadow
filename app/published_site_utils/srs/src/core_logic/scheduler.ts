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

import type { SrsCardState, SrsReviewRating } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function clampEaseFactor(value: number): number {
  return Math.min(3.2, Math.max(1.3, value));
}

function computeFuzz(cardId: string, reviewCount: number): number {
  let seed = 0;
  const signature = `${cardId}:${reviewCount}`;
  for (let index = 0; index < signature.length; index += 1) {
    seed = (seed * 31 + signature.charCodeAt(index)) % 1000;
  }
  return (seed / 1000) * 0.1 - 0.05;
}

function applyFuzz(intervalMs: number, cardId: string, reviewCount: number): number {
  if (intervalMs < DAY_MS) {
    return intervalMs;
  }
  return Math.max(DAY_MS, Math.floor(intervalMs * (1 + computeFuzz(cardId, reviewCount))));
}

export function scheduleNextReview(
  previousState: SrsCardState,
  rating: SrsReviewRating,
  now: Date,
): SrsCardState {
  const next = { ...previousState };
  const wasNew = previousState.reviewCount === 0;
  const baseInterval = Math.max(previousState.intervalMs, wasNew ? 0 : DAY_MS);

  if (rating === 'again') {
    next.intervalMs = wasNew ? 10 * MINUTE_MS : Math.max(30 * MINUTE_MS, Math.floor(baseInterval * 0.2));
    next.easeFactor = clampEaseFactor(previousState.easeFactor - 0.2);
    next.lapseCount += 1;
  } else if (rating === 'hard') {
    next.intervalMs = wasNew ? DAY_MS : Math.max(DAY_MS, Math.floor(baseInterval * 1.2));
    next.easeFactor = clampEaseFactor(previousState.easeFactor - 0.15);
  } else if (rating === 'good') {
    next.intervalMs = wasNew ? 2 * DAY_MS : Math.max(DAY_MS, Math.floor(baseInterval * previousState.easeFactor));
  } else {
    next.intervalMs = wasNew
      ? 4 * DAY_MS
      : Math.max(DAY_MS, Math.floor(baseInterval * (previousState.easeFactor + 0.3) * 1.15));
    next.easeFactor = clampEaseFactor(previousState.easeFactor + 0.15);
  }

  next.reviewCount += 1;
  next.lastReviewedAt = now.toISOString();
  next.intervalMs = applyFuzz(next.intervalMs, previousState.cardId, next.reviewCount);
  delete next.buriedUntil;
  next.dueAt = new Date(now.getTime() + next.intervalMs).toISOString();
  return next;
}
