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

import type { SrsPersistence } from './types';

export const SRS_STORAGE_PREFIX = 'meadow:srs';

export function makeStorageKey(siteGuid: string): string {
  return `${SRS_STORAGE_PREFIX}:${siteGuid}`;
}

export function createLocalStoragePersistence(storage: Storage = window.localStorage): SrsPersistence {
  return {
    load: (key) => storage.getItem(key),
    save: (key, value) => storage.setItem(key, value),
    clear: (key) => storage.removeItem(key),
  };
}

export function createMemoryPersistence(seed: Record<string, string> = {}): SrsPersistence {
  const memory = new Map(Object.entries(seed));
  return {
    load: (key) => memory.get(key) ?? null,
    save: (key, value) => {
      memory.set(key, value);
    },
    clear: (key) => {
      memory.delete(key);
    },
  };
}
