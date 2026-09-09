/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SourceSnapshotHistory } from '../../../../../../../contracts/types/sourcing.js';
import Modal from '../../../../shared/components/Modal.js';
import { Spinner } from '../../../../shared/components/Spinner.js';
import { apiRequest } from '../../../../shared/utils/apiClient.js';

export function SourceSnapshotsModal({ isOpen, bundleSlug, onClose }: { isOpen: boolean; bundleSlug: string; onClose: () => void }) {
  const [history, setHistory] = useState<SourceSnapshotHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const abort = new AbortController();
    setHistory(null); setError(null);
    void (async () => {
      try {
        const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/sourcing/history`, { signal: abort.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load source snapshots');
        if (!abort.signal.aborted) setHistory(result as SourceSnapshotHistory);
      } catch (err) {
        if (!abort.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => abort.abort();
  }, [isOpen, bundleSlug, retry]);

  if (!isOpen) return null;
  return createPortal(<Modal isOpen onClose={onClose} title="Source snapshots" closeLabel="Close source snapshots" manageFocus className="w-full max-w-lg">
    <p className="mb-4 text-sm text-neutral-500">Accepted source material for this bundle. Curation and generation use the current snapshot.</p>
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-danger-700">{error}</p><button className="text-sm text-main-700 hover:underline" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
      : !history ? <p role="status" className="flex items-center gap-2 text-sm text-neutral-500"><Spinner />Loading snapshots</p>
        : history.snapshots.length === 0 ? <p className="text-sm text-neutral-500">No accepted source snapshots yet.</p>
          : <ol aria-label="Accepted source snapshots" className="divide-y divide-neutral-100">
            {[...history.snapshots].reverse().map(item => <li key={item.id} data-snapshot-id={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
              <div>
                <time dateTime={item.acceptedAt ?? item.capturedAt} className="text-sm font-medium text-neutral-800">{new Date(item.acceptedAt ?? item.capturedAt).toLocaleString()}</time>
                <p className="mt-1 text-xs text-neutral-500">{item.fileCount.toLocaleString()} source {item.fileCount === 1 ? 'file' : 'files'}</p>
              </div>
              {item.id === history.acceptedId && <span className="rounded bg-main-50 px-2 py-1 text-xs font-medium text-main-800">Current</span>}
            </li>)}
          </ol>}
  </Modal>, document.body);
}
