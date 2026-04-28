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
import { createMemoryPersistence, makeStorageKey } from '../persistence';
import { loadStore, saveStore } from '../state';

describe('persistence', () => {
  it('uses site guid in the storage key', () => {
    expect(makeStorageKey('abc1234')).toBe('meadow:srs:abc1234');
  });

  it('round-trips store data', () => {
    const persistence = createMemoryPersistence();
    saveStore('site1234', persistence, {
      version: 1,
      cards: {
        one: {
          cardId: 'one',
          intervalMs: 1000,
          easeFactor: 2.5,
          dueAt: '2026-03-12T00:00:00.000Z',
          reviewCount: 1,
          lapseCount: 0,
        },
      },
    });

    expect(loadStore('site1234', persistence).cards.one.intervalMs).toBe(1000);
  });
});
