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

import type { SourcePageFileInfo } from '../types/sourcePageFileInfo.js';

export type SourcePageSearchBucket = 1 | 2 | 3;

function normalizeForSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function bucketForTitle(queryNormalized: string, title: string): SourcePageSearchBucket | null {
  const titleNormalized = normalizeForSearch(title);
  if (!queryNormalized) return null;

  // Single "substring contains" search when query has no spaces.
  if (!queryNormalized.includes(' ')) {
    return titleNormalized.includes(queryNormalized) ? 1 : null;
  }

  // Space-aware behavior when the user includes spaces.
  // Bucket 1: match the entire substring including the spaces (after normalization).
  if (titleNormalized.includes(queryNormalized)) return 1;

  const parts = queryNormalized.split(' ').filter(Boolean);
  if (parts.length === 0) return null;

  // Bucket 2: all parts present somewhere (order-independent).
  const allParts = parts.every(p => titleNormalized.includes(p));
  if (allParts) return 2;

  // Bucket 3: only some parts present.
  const anyParts = parts.some(p => titleNormalized.includes(p));
  if (anyParts) return 3;

  return null;
}

/**
 * Returns candidates in priority order:
 * - Case-insensitive
 * - If query contains spaces: bucket 1 (full substring), bucket 2 (all parts), bucket 3 (any part)
 * - Within a bucket: newest -> oldest by modifiedTimeMs
 */
export function rankSourcePageCandidatesWithCount(
  query: string,
  pages: SourcePageFileInfo[],
  limit: number = 25
): { totalCount: number; results: Array<SourcePageFileInfo & { bucket: SourcePageSearchBucket }> } {
  const queryNormalized = normalizeForSearch(query);
  if (!queryNormalized) return { totalCount: 0, results: [] };

  const scored: Array<SourcePageFileInfo & { bucket: SourcePageSearchBucket }> = [];
  for (const page of pages) {
    const bucket = bucketForTitle(queryNormalized, page.title);
    if (!bucket) continue;
    scored.push({ ...page, bucket });
  }

  scored.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (a.modifiedTimeMs !== b.modifiedTimeMs) return b.modifiedTimeMs - a.modifiedTimeMs;
    // Stable-ish tie-break for deterministic ordering.
    if (a.fullPath !== b.fullPath) return a.fullPath.localeCompare(b.fullPath);
    return a.title.localeCompare(b.title);
  });

  return { totalCount: scored.length, results: scored.slice(0, Math.max(0, limit)) };
}

/**
 * Default suggestions when there's no query: show most recently modified pages.
 */
export function recentSourcePageCandidatesWithCount(
  pages: SourcePageFileInfo[],
  limit: number = 25
): { totalCount: number; results: Array<SourcePageFileInfo & { bucket: SourcePageSearchBucket }> } {
  const sorted = [...pages].sort((a, b) => {
    if (a.modifiedTimeMs !== b.modifiedTimeMs) return b.modifiedTimeMs - a.modifiedTimeMs;
    if (a.fullPath !== b.fullPath) return a.fullPath.localeCompare(b.fullPath);
    return a.title.localeCompare(b.title);
  });
  const results = sorted.slice(0, Math.max(0, limit)).map(n => ({ ...n, bucket: 1 as SourcePageSearchBucket }));
  return { totalCount: pages.length, results };
}

/**
 * Backwards-compatible helper: returns the top results only (default limit 25).
 */
export function rankSourcePageCandidates(
  query: string,
  pages: SourcePageFileInfo[],
  limit: number = 25
): Array<SourcePageFileInfo & { bucket: SourcePageSearchBucket }> {
  return rankSourcePageCandidatesWithCount(query, pages, limit).results;
}

