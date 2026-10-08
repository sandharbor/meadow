/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import type { SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import Modal from '../../../../shared/components/Modal.js';
import DiffView from '../../../../../shared_components/ConfigFileExplorer/DiffView.js';
import type { EditorOperations } from '../types/editorOperations.js';
import { PathChange, PathPresence } from '../../../../shared/components/PathChange.js';

type Comparison = { before: string | null; after: string | null; binary: boolean; beforeImage?: boolean; afterImage?: boolean };

export function SourceContentComparison({ evidence, onClose, request }: { evidence: SourceNodeReview; onClose: () => void; request: EditorOperations['request'] }) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [images, setImages] = useState<{ before?: string; after?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const removed = evidence.kind === 'departing';
  useEffect(() => {
    setComparison(null); setImages({}); setError(null);
    let cancelled = false;
    const urls: string[] = [];
    const read = async () => {
      const query = new URLSearchParams({ beforeId: evidence.beforeSnapshotId, afterId: evidence.afterSnapshotId,
        beforePath: evidence.previousPath ?? evidence.proposedPath ?? '', afterPath: evidence.proposedPath ?? evidence.previousPath ?? '' });
      const response = await request(`source-comparison?${query}`);
      if (!response.ok) throw new Error('Captured source comparison is unavailable.');
      const value = await response.json() as Comparison;
      if (cancelled) return;
      setComparison(value);
      const next: { before?: string; after?: string } = {};
      const sides: readonly ('before' | 'after')[] = removed ? ['before'] : ['before', 'after'];
      for (const side of sides) {
        if (!value[side === 'before' ? 'beforeImage' : 'afterImage']) continue;
        const image = await request(`source-image?${new URLSearchParams({ snapshotId: side === 'before' ? evidence.beforeSnapshotId : evidence.afterSnapshotId, path: (side === 'before' ? evidence.previousPath : evidence.proposedPath) ?? '' })}`);
        if (!image.ok) throw new Error('Captured image is unavailable.');
        const url = URL.createObjectURL(await image.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urls.push(url); next[side] = url;
      }
      if (!cancelled) setImages(next);
    };
    void read().catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [evidence, request, removed]);
  const before = evidence.previousPath, after = removed ? undefined : evidence.proposedPath;
  // Only a path that changes is shown: removed in red, added in green, or the before → after difference.
  const path = before && after ? before !== after && <PathChange before={before} after={after} />
    : before ? <PathPresence path={before} side="before" /> : after ? <PathPresence path={after} side="after" /> : null;
  return <Modal isOpen title="Changes" onClose={onClose}>
    {path && <div className="mb-3">{path}</div>}
      {error && <p role="alert">{error}</p>}
      {!comparison && !error && <p>Loading captured content…</p>}
      {comparison && <div className="mt-2 overflow-auto" aria-label="Source content comparison" role="region">
        {removed ? <div aria-label="Previous source content" role="region">
          {comparison.binary ? images.before ? <img alt="before captured source" src={images.before} /> : <p>Previous binary content has no text preview.</p>
            : <DiffView originalContent={comparison.before} currentContent="" isNewFile={false} isDeletedFile codeOnly wrapLines lineLabels={{ before: 'Accepted source', after: 'Proposed source' }} />}
        </div> : comparison.binary ? images.before || images.after ? <div className="grid grid-cols-2 gap-2">{(['before', 'after'] as const).map(side => <figure key={side}><figcaption>{side === 'before' ? 'Accepted capture' : 'Proposed capture'}</figcaption>{images[side] ? <img alt={`${side} captured source`} src={images[side]} /> : <p>Not included</p>}</figure>)}</div> : <p>Binary content differs between these captures.</p>
          : <DiffView originalContent={comparison.before} currentContent={comparison.after ?? ''} isNewFile={comparison.before === null} isDeletedFile={comparison.after === null} codeOnly wrapLines lineLabels={{ before: 'Accepted source', after: 'Proposed source' }} unchangedLabel="No content changes" />}
      </div>}
  </Modal>;
}
