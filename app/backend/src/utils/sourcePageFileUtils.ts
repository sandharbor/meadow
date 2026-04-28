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

import type { SourcePageFileInfo } from '../../../shared_code/types/sourcePageFileInfo.js';
import { runSourcePageSearchByTitle } from './sourcePageSearchByTitleUtils.js';

type SourcePageIndexCacheEntry = {
  expiresAtMs: number;
  data: SourcePageFileInfo[] | null;
  inFlight: Promise<SourcePageFileInfo[]> | null;
};

const CACHE_TTL_MS = 30_000;
const sourcePageIndexCache = new Map<string, SourcePageIndexCacheEntry>();

async function getOrBuildSourcePageIndex(sourceDirectory: string): Promise<SourcePageFileInfo[]> {
  const now = Date.now();
  const existing = sourcePageIndexCache.get(sourceDirectory);

  if (existing?.data && existing.expiresAtMs > now) {
    return existing.data;
  }

  if (existing?.inFlight) {
    return await existing.inFlight;
  }

  const entry: SourcePageIndexCacheEntry = existing ?? { expiresAtMs: 0, data: null, inFlight: null };
  const inFlight = (async () => {
    try {
      const pages = await runSourcePageSearchByTitle(sourceDirectory);
      entry.data = pages;
      entry.expiresAtMs = Date.now() + CACHE_TTL_MS;
      return pages;
    } finally {
      entry.inFlight = null;
    }
  })();

  entry.inFlight = inFlight;
  sourcePageIndexCache.set(sourceDirectory, entry);
  return await inFlight;
}

/**
 * Uses the source_page_search_by_title Rust utility to find markdown files under a sourceDirectory.
 *
 * Note: This intentionally shares the same underlying file discovery mechanism as duplicate-title
 * resolution and the create/edit site modal typeahead.
 */
export async function listMarkdownSourcePages(sourceDirectory: string): Promise<SourcePageFileInfo[]> {
  // Note: despite the name, this returns the cached index of markdown files discovered by the
  // Rust utility.
  return await getOrBuildSourcePageIndex(sourceDirectory);
}
