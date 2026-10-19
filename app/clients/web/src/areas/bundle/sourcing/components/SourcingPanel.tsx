/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { logger } from '../../../../shared/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorMode, useIsSurfaceRequested, useLinkedSurface } from '../../../../shared/places/placeContext.js';
import type { SnapshotTrackingOutcome } from '../../../../../../../contracts/types/shared/curation/curationTracking.js';
import { SourceSnapshotsModal } from './SourceSnapshotsModal.js';
import { RefreshSourcesButton } from './RefreshSourcesButton.js';
import { SourcingWorkspace } from './SourcingWorkspace.js';
import { proposalRequest } from './proposalClient.js';
import './SourcingPanel.css';
import { useSourceStatus } from './useSourceStatus.js';

export function SourcingPanel({ bundleSlug, onAccepted, sourceChangeTrigger = 0, reviewTrigger = 0, sensitivityReviewTrigger = 0, sensitivityCount = 0, onPendingChanges, snapshotsOpen = false, onCloseSnapshots, onModeChange }: {
  sensitivityReviewTrigger?: number; sensitivityCount?: number;
  onModeChange?: (sourcing: boolean) => void; reviewTrigger?: number; snapshotsOpen?: boolean; onCloseSnapshots?: () => void;
  onPendingChanges?: (pending: boolean) => void; sourceChangeTrigger?: number;
  bundleSlug: string; hasDraftChanges: boolean; onAccepted: (result: { trackingOutcome?: SnapshotTrackingOutcome }) => void;
}) {
  const [open, setOpen] = useState(false);
  // Curation stays in place until the page changes graph is ready to replace it. Only the mounted
  // workspace sets this, so a close and reopen in one update cannot leave a ready review unreported.
  const [ready, setReady] = useState(false);
  const [placeParameters, setPlaceParameters] = useState<Readonly<Record<string, string>>>({});
  const [requestedParameters, setRequestedParameters] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => { logger.debug(`[editor-mode] panel open=${open} ready=${ready}`); onModeChange?.(open && ready); }, [open, ready, onModeChange]);
  const { review, busy, setBusy, background, noChanges, error, setError, scan } = useSourceStatus(bundleSlug, onPendingChanges);
  const requested = useIsSurfaceRequested();
  const openRef = useRef(open);
  openRef.current = open;
  const enter = useCallback(async (parameters?: Readonly<Record<string, string>>) => {
    setBusy(true); setError(null);
    try { if (!openRef.current) await proposalRequest(bundleSlug, 'begin', {}); openRef.current = true; if (parameters) setRequestedParameters(parameters); setOpen(true); }
    catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }, [bundleSlug, setBusy, setError]);
  const close = useCallback(() => { setOpen(false); setRequestedParameters({}); setPlaceParameters({}); }, []);
  useEditorMode(open ? 'sourcing' : 'curation', async mode => {
    logger.debug(`[editor-mode] editor mode request ${mode} (open=${openRef.current})`);
    if (mode === 'sourcing') await enter(); else close();
  });
  useEffect(() => {
    if (!requested('source-review')) void scan();
    const timer = window.setInterval(() => {
      if (!openRef.current && !document.hidden && !document.querySelector('[aria-modal="true"]')) void scan(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [scan, requested]);
  useEffect(() => { if (sourceChangeTrigger) void scan(); }, [sourceChangeTrigger, scan]);
  useEffect(() => { if (reviewTrigger) void enter(); }, [reviewTrigger, enter]);
  useEffect(() => { if (sensitivityReviewTrigger) void enter({ review: 'sensitivity' }); }, [sensitivityReviewTrigger, enter]);
  // The workspace owns detailed place parameters while mounted. This entry
  // handler also makes a source-review link work from a fresh editor.
  useLinkedSurface('source-review', { open, parameters: placeParameters }, {
    open: async parameters => { logger.debug(`[editor-mode] surface open ${JSON.stringify(parameters)}`); await enter(parameters); return true as const; }, close: () => { logger.debug('[editor-mode] surface close'); close(); },
  });
  // A kept proposal may hold only staged settings or tracking; it still needs a way back in.
  const pending = Boolean(review?.candidate || review?.orphans.length || review?.pendingProposal);
  const count = (review?.changes.length ?? 0) + (review?.moves.length ?? 0) + (review?.orphans.length ?? 0);
  const progress = background && <span data-testid="source-background-progress" aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500" />;
  return <>
    <SourceSnapshotsModal isOpen={snapshotsOpen} bundleSlug={bundleSlug} onClose={() => onCloseSnapshots?.()} checking={busy || background} onRecheck={() => { onCloseSnapshots?.(); void scan(false, true); }} />
    <div className="flex items-center gap-2 whitespace-nowrap text-sm" data-testid="sourcing-status" data-orphan-count={review?.orphans.length ?? 0} aria-live="polite">
      {sensitivityCount > 0 && <button className="rounded bg-amber-100 px-3 py-1 font-medium text-amber-900" onClick={() => void enter({ review: 'sensitivity' })}>{sensitivityCount} tracked {sensitivityCount === 1 ? 'node became' : 'nodes became'} sensitive – Review</button>}
      {pending && <button className="relative overflow-hidden rounded bg-blue-100 px-3 py-1 font-medium text-blue-900" onClick={() => void enter()}>{count ? `${count} source change${count === 1 ? '' : 's'} available` : 'Changes pending'} – Review{progress}</button>}
      <RefreshSourcesButton compact={pending} refreshing={busy} disabled={busy} backgroundBusy={background} noChanges={noChanges} onClick={() => void scan(false, false, true)}>{!pending && progress}</RefreshSourcesButton>
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </div>
    {open && createPortal(<SourcingWorkspace onReadyChange={setReady} requestedParameters={requestedParameters} onPlaceChange={setPlaceParameters} bundleSlug={bundleSlug} onClose={() => { close(); void scan(true); }} onAccepted={result => { onAccepted(result); onPendingChanges?.(false); }} />, document.body)}
  </>;
}
