/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import type { SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import { lineChangeCounts } from '../../../../../../../shared_code/utils/lineChanges.js';
import type { EditorOperations } from '../types/editorOperations.js';

export function useSourceLineCounts(evidence: SourceNodeReview, request: EditorOperations['request']) {
  const query = new URLSearchParams({ beforeId: evidence.beforeSnapshotId, afterId: evidence.afterSnapshotId,
    beforePath: evidence.previousPath ?? evidence.proposedPath ?? '', afterPath: evidence.proposedPath ?? evidence.previousPath ?? '' }).toString();
  const kind = evidence.kind;
  const previousPath = evidence.previousPath;
  // The comparison review computes counts with the graph; only evidence assembled elsewhere is fetched here.
  const precomputed = evidence.lineCounts !== undefined;
  const [result, setResult] = useState<{ query: string; kind: SourceNodeReview['kind']; counts?: { added: number; removed: number }; hasPreviousContent: boolean } | null>(null);
  useEffect(() => {
    if (precomputed || kind === 'frontier' || kind === 'unchanged') return;
    let cancelled = false;
    const read = async () => {
      const response = await request(`source-comparison?${query}`);
      if (!response.ok) return;
      const content = await response.json() as { before: string | null; after: string | null; binary: boolean; beforeImage?: boolean };
      // Binary and oversized files have no inline text diff to count.
      const after = kind === 'departing' ? null : content.after;
      const counts = content.binary || [content.before, after].includes('[File is too large for the inline comparison]') ? undefined : lineChangeCounts(content.before, after);
      const hasPreviousContent = content.binary ? content.beforeImage ?? Boolean(previousPath) : Boolean(content.before?.trim());
      if (!cancelled) setResult({ query, kind, counts, hasPreviousContent });
    };
    void read().catch(() => { /* The comparison remains available through See changes. */ });
    return () => { cancelled = true; };
  }, [precomputed, query, kind, previousPath, request]);
  if (precomputed) return { query, kind, counts: evidence.lineCounts ?? undefined, hasPreviousContent: evidence.hasPreviousContent ?? false };
  return result?.query === query && result.kind === kind ? result : null;
}

export function SourceLineCounts({ counts, removed = false }: { counts?: { added: number; removed: number }; removed?: boolean }) {
  if (!counts) return null;
  return <span data-testid="source-line-counts" aria-label={removed ? `${counts.removed} removed lines` : `${counts.added} added lines, ${counts.removed} removed lines`} className="ml-auto inline-flex gap-1 whitespace-nowrap font-medium tabular-nums">
    {!removed && <span className="text-success-600">+{counts.added}</span>}
    <span className="text-danger-600">-{counts.removed}</span>
  </span>;
}
