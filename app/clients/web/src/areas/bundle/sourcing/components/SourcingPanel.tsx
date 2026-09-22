/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { SourceNamesProvider } from '../../../../shared/components/SourceNames.js';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../../../shared/components/Modal.js';
import { proposedSourceMoveResolutions } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { SourceSnapshotsModal } from './SourceSnapshotsModal.js';
import { MoveTraversal } from './MoveTraversal.js';
import { OrphanReview } from './OrphanReview.js';
import { FileRoute } from './SourceFileRoute.js';
import { useSourceTraversal } from './useSourceTraversal.js';
import TraversalPathDetailsModal from '../../../../shared/components/TraversalPathDetailsModal.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { isSourceImage, SourceImagePreview, SourceImageComparison, type SourceImageUrl } from './SourceImagePreview.js';
import { SourceChangeCount, SourcePath } from './SourceReviewPresentation.js';
import DiffView from '../../../../../shared_components/ConfigFileExplorer/DiffView.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { Spinner } from '../../../../shared/components/Spinner.js';
import type { SourcingReview, SourceSnapshotAcceptanceResult } from '../../../../../../../contracts/types/sourcing.js';
import type { TrackingSensitivity } from '../../../../../../../contracts/types/curationTracking.js';
import './SourcingPanel.css';
import { apiRequest } from '../../../../shared/utils/apiClient.js';

// Check the rendered modal state at each tick, including dialogs opened in portals.
function canAutomaticallyRefreshSources(): boolean {
  return !document.hidden && !document.querySelector('[aria-modal="true"], dialog[open]');
}

interface Comparison { beforePath: string; afterPath: string; before: string | null; after: string | null; binary: boolean; beforeImage?: boolean; afterImage?: boolean; }
function ContentComparison({ comparison, imageUrl }: { comparison: Comparison; imageUrl: SourceImageUrl }) {
  return <section aria-label="Source content comparison" className="mt-3 overflow-hidden rounded border border-neutral-200">
    {isSourceImage(comparison.afterPath || comparison.beforePath) ? <SourceImageComparison {...comparison} imageUrl={imageUrl} /> : comparison.binary ? <p className="p-3 text-sm text-neutral-600">Binary file. Use the matching evidence to compare its contents.</p> : <>
      <div className="max-h-80 overflow-auto [&>div]:h-auto">
        <DiffView key={`${comparison.beforePath}:${comparison.afterPath}`} originalContent={comparison.before} currentContent={comparison.after ?? ''} isNewFile={comparison.before === null} isDeletedFile={comparison.after === null} codeOnly wrapLines lineLabels={{ before: 'Accepted source', after: 'Candidate source' }} unchangedLabel="No content changes" />
      </div>
    </>}
  </section>;
}


function SourceChangeRow({ change, sensitivity, loadComparison, imageUrl, graph, onTraversalDetails }: { sensitivity?: TrackingSensitivity; graph?: Graph; onTraversalDetails?: () => void; imageUrl: SourceImageUrl; change: SourcingReview['changes'][number]; loadComparison: () => Promise<Comparison> }) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (open: boolean) => {
    setExpanded(open);
    if (!open || comparison || loading) return;
    setLoading(true); setError(null);
    try { setComparison(await loadComparison()); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  };
  const route = change.route?.length ? [...change.route] : [];
  const sensitivityBadge = sensitivity && <span className="shrink-0 rounded bg-danger-100 px-1.5 py-0.5 text-xs text-danger-800" title={sensitivity === 'source' ? 'Marked meadow-sensitive in the captured page. Bulk tracking will skip it.' : 'An enabled bundle or global filter marks this page sensitive. Bulk tracking will skip it.'}>{sensitivity === 'source' ? 'Sensitive' : 'Sensitive via filter'}</span>;
  if (route.length && route.at(-1) !== change.path) route.push(change.path);
  if (change.kind === 'added' && isSourceImage(change.path)) return <div className="ml-3 flex items-center gap-2 py-2.5 text-xs text-neutral-500">
    <span className="w-28 shrink-0">Added</span><SourcePath value={change.path} />{sensitivityBadge}
    <SourceImagePreview url={imageUrl(change.path, 'after')} filename={change.path} route={route} graph={graph} />
    {onTraversalDetails && <button type="button" className="text-main-700 underline" aria-label={`Traversal details for ${change.path}`} onClick={onTraversalDetails}>Details</button>}
  </div>;
  return <details className="py-2.5 text-sm text-neutral-500" onToggle={event => void toggle(event.currentTarget.open)}>
    <summary className="ml-3 cursor-pointer rounded text-xs hover:bg-neutral-50 [list-style-position:outside]" aria-label={`Details ${change.path}`} aria-expanded={expanded} aria-controls={contentId}>
      <span className="flex items-baseline gap-2">
        <span className="w-28 shrink-0 text-neutral-500">{change.kind === 'missing' ? 'No longer included' : change.kind === 'added' ? 'Added' : 'Modified'}</span>
        <SourcePath value={change.path} />
        {sensitivityBadge}
      </span>
    </summary>
    <div id={contentId} hidden={!expanded}>
      {change.kind === 'added' && route.length > 0 && <div className="mt-3 text-xs text-neutral-500">Reached through · Candidate source<FileRoute paths={route} graph={graph} onDetails={onTraversalDetails} /></div>}
      {loading && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-neutral-500"><Spinner />Loading comparison</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      {comparison && <ContentComparison comparison={comparison} imageUrl={imageUrl} />}
    </div>
  </details>;
}

export function SourcingPanel({ bundleSlug, hasDraftChanges, onAccepted, sourceChangeTrigger = 0, reviewTrigger = 0, initialReview = false, onPendingChanges, snapshotsOpen = false, onCloseSnapshots }: {
  reviewTrigger?: number;
  snapshotsOpen?: boolean;
  onCloseSnapshots?: () => void;
  onPendingChanges?: (pending: boolean) => void;
  sourceChangeTrigger?: number;
  initialReview?: boolean;
  bundleSlug: string; hasDraftChanges: boolean; onAccepted: (result: SourceSnapshotAcceptanceResult) => void;
}) {
  const [review, setReview] = useState<SourcingReview | null>(null);
  const traversal = useSourceTraversal(review, bundleSlug);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (review) onPendingChanges?.(Boolean(review.candidate)); }, [review, onPendingChanges]);
  const [busy, setBusy] = useState(true);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const foregroundScan = useRef(false);
  const [noChanges, setNoChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string | null>>({});
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const requestGeneration = useRef(0);
  const inFlight = useRef(false);
  const sourceCheck = useRef<{ endpoint: string; promise: Promise<SourcingReview> }>();
  const reviewToken = useRef<string>();
  const [orphanKeeps, setOrphanKeeps] = useState<string[]>([]);
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [trackNewPages, setTrackNewPages] = useState(true);
  const trackNewPagesHintId = useId();
  const closeTraversal = traversal.close;
  const closeReview = useCallback(() => { closeTraversal(); setOpen(false); }, [closeTraversal]);
  const endpoint = `bundles/${encodeURIComponent(bundleSlug)}/sourcing`;

  const request = useCallback(async (suffix = '', body?: unknown) => {
    const response = await apiRequest(`${endpoint}${suffix}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Source operation failed');
    return result;
  }, [endpoint]);

  const receive = useCallback((result: SourcingReview, announceNoChanges = true) => {
    if (reviewToken.current !== result.reviewToken) { setResolutions({}); setComparison(null); setOrphanKeeps([]); setShowAllChanges(false); setTrackNewPages(result.trackNewPages ?? true); }
    reviewToken.current = result.reviewToken;
    setReview(result);
    setNoChanges(announceNoChanges && !result.candidate && result.orphans.length === 0);
  }, []);

  const scan = useCallback(async (replaceCandidate = false, background = false, rebuildIndex = false) => {
    if (inFlight.current) {
      // A requested check can promote the check already running without duplicating it.
      if (!background) { foregroundScan.current = true; setBusy(true); setBackgroundBusy(false); }
      return;
    }
    inFlight.current = true;
    foregroundScan.current = !background;
    const generation = requestGeneration.current;
    if (background) setBackgroundBusy(true);
    else { setBusy(true); setNoChanges(false); }
    setError(null);
    // React can replay an effect during development while its first request is
    // still running. Reuse that request, but let the current effect receive it.
    const operation = !rebuildIndex && sourceCheck.current?.endpoint === endpoint ? sourceCheck.current
      : { endpoint, promise: request('/scan', { replaceCandidate, ...(rebuildIndex && { rebuildIndex: true }) }) as Promise<SourcingReview> };
    sourceCheck.current = operation;
    try {
      const result = await operation.promise;
      if (generation === requestGeneration.current) receive(result, foregroundScan.current);
    } catch (err) { if (generation === requestGeneration.current) setError(err instanceof Error ? err.message : String(err)); }
    finally {
      if (sourceCheck.current === operation) sourceCheck.current = undefined;
      if (generation === requestGeneration.current) { inFlight.current = false; setBusy(false); setBackgroundBusy(false); }
    }
  }, [endpoint, request, receive]);

  useEffect(() => {
    requestGeneration.current += 1;
    inFlight.current = false;
    reviewToken.current = undefined;
    setBackgroundBusy(false);
    setReview(null); setResolutions({}); setComparison(null); setError(null); setOpen(initialReview);
    if (initialReview) {
      const generation = requestGeneration.current;
      setBusy(true);
      void request().then(result => {
        if (generation === requestGeneration.current) receive(result as SourcingReview, false);
      }).catch(err => {
        if (generation === requestGeneration.current) setError(err instanceof Error ? err.message : String(err));
      }).finally(() => { if (generation === requestGeneration.current) setBusy(false); });
    } else if (canAutomaticallyRefreshSources()) void scan(true);
    const timer = window.setInterval(() => {
      if (canAutomaticallyRefreshSources()) void scan(true, true);
    }, 30000);
    return () => { requestGeneration.current += 1; window.clearInterval(timer); };
  }, [scan, initialReview, request, receive]);

  useEffect(() => {
    if (busy || !noChanges) return;
    const timer = window.setTimeout(() => setNoChanges(false), 2000);
    return () => window.clearTimeout(timer);
  }, [busy, noChanges]);

  useEffect(() => {
    if (sourceChangeTrigger) void scan(true);
  }, [sourceChangeTrigger, scan]);

  useEffect(() => {
    if (!reviewTrigger) return;
    setOpen(true); setBusy(true); setError(null);
    void request().then(result => receive(result as SourcingReview, false))
      .catch(error => setError(String(error))).finally(() => setBusy(false));
  }, [reviewTrigger, request, receive]);

  const cancelCandidate = async () => {
    setBusy(true); setError(null);
    try { receive(await request('/cancel', {}) as SourcingReview); setOpen(false); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };

  const inspect = async (oldPath: string, newPath: string) => {
    if (!review?.candidate) return;
    try {
      const query = new URLSearchParams({ beforeId: review.accepted.id, afterId: review.candidate.id, beforePath: oldPath, afterPath: newPath });
      const result = await request(`/comparison?${query}`);
      setComparison({ beforePath: oldPath, afterPath: newPath, ...result });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const orphanRemovals = new Set((review?.orphans ?? []).filter(orphan => !orphan.removalBlockedReason).map(orphan => orphan.bundleNodeId));

  const accept = async () => {
    if (!review || (!review.candidate && orphanRemovals.size === 0)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await request('/accept', { candidateId: review.candidate?.id ?? review.accepted.id, reviewToken: review.reviewToken, resolutions, orphanKeeps, trackNewPages }) as SourceSnapshotAcceptanceResult;
      receive(result);
      setOpen(false); setComparison(null); setResolutions({}); onAccepted(result);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const groups = new Map<string, SourcingReview['moves']>();
  for (const move of review?.moves ?? []) groups.set(move.bundleNodeId, [...(groups.get(move.bundleNodeId) ?? []), move]);
  const changeCount = groups.size + new Set([...(review?.changes.map(change => change.path) ?? []), ...(review?.orphans.map(orphan => orphan.path) ?? [])]).size;
  const reviewLabel = changeCount > 0
    ? `${changeCount} source change${changeCount === 1 ? '' : 's'} available – Review`
    : 'Source changes available – Review';
  const backgroundProgress = backgroundBusy && <span aria-hidden="true" data-testid="source-background-progress" className="absolute bottom-0 left-0 h-0.5 w-1/3 bg-current motion-safe:animate-[source-update-sweep_1.2s_ease-in-out_infinite_alternate] motion-reduce:w-full" />;
  const imageUrl: SourceImageUrl = (filename, side) => `bundles/${encodeURIComponent(bundleSlug)}/sourcing/image?${new URLSearchParams({ snapshotId: (side === 'before' ? review?.accepted.id : review?.candidate?.id) ?? '', path: filename })}`;
  const proposedResolutions = proposedSourceMoveResolutions(review?.moves ?? [], resolutions);
  const orderedChanges = [...(review?.changes ?? [])].sort((left, right) => Number(right.kind === 'added') - Number(left.kind === 'added'));
  const hasAddedPages = orderedChanges.some(change => change.kind === 'added');

  return <>
    <SourceSnapshotsModal isOpen={snapshotsOpen} bundleSlug={bundleSlug} onClose={() => onCloseSnapshots?.()}
      checking={busy || backgroundBusy} onRecheck={() => {
        onCloseSnapshots?.();
        setOpen(true);
        void scan(true, false, true);
      }} />
    <div className="flex items-center gap-2 whitespace-nowrap text-sm" data-testid="sourcing-status" data-orphan-count={review?.orphans.length ?? 0} aria-live="polite">
      {busy ? <span role="status" className="flex items-center gap-2 text-neutral-500"><Spinner />Refreshing sources</span>
        : review && (review.candidate || review.orphans.length > 0) ? <button aria-busy={backgroundBusy} className="relative overflow-hidden rounded bg-blue-100 px-3 py-1 font-medium text-blue-900" onClick={() => setOpen(true)}>{reviewLabel}{backgroundProgress}</button>
        : noChanges ? <span role="status" className="text-neutral-500">No changes</span>
        : <button aria-busy={backgroundBusy} className="relative overflow-hidden rounded border border-neutral-300 bg-neutral-50 px-3 py-1 font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" onClick={() => void scan(true)}>Refresh sources{backgroundProgress}</button>}
      {error && !open && <span role="alert" title={error} className="text-red-700">Source update failed<span className="sr-only">: {error}</span></span>}
    </div>
    {open && createPortal(<SourceNamesProvider sources={[...(review?.accepted.sourceNames ?? []), ...(review?.candidate?.sourceNames ?? [])]}><Modal isOpen={open} onClose={closeReview} title="Source changes" closeLabel="Close source changes" manageFocus={!traversal.details} className="w-full max-w-3xl" footer={
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="text-xs text-main-700 hover:underline disabled:opacity-50" disabled={busy || backgroundBusy} onClick={() => void scan(true)}>{busy || backgroundBusy ? 'Checking…' : 'Check again'}</button>
        <p className="mr-auto text-xs text-neutral-500" role="status">{hasDraftChanges ? 'Save or undo curation changes before accepting.' : ''}</p>
        {review?.candidate && <button className="text-sm text-neutral-600 underline disabled:opacity-50" disabled={busy || backgroundBusy} onClick={() => void cancelCandidate()}>Discard candidate</button>}
        <button className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50" onClick={closeReview}>Later</button>
        {(review?.candidate || orphanRemovals.size > 0) && <button className="rounded bg-btn-confirm-normal px-4 py-2 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:opacity-50" disabled={busy || backgroundBusy || hasDraftChanges || review?.sourceChanges?.stale} onClick={() => void accept()}>Accept source changes</button>}
      </div>
    }>
      <div className="space-y-5 text-neutral-800">
        {!review?.candidate && !review?.orphans.length && <p className="text-xs text-neutral-500">{busy ? 'Checking sources…' : 'No source changes are waiting.'}</p>}
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {review?.sourceChanges && <section aria-label="Source registry changes" className="space-y-3 rounded border border-neutral-200 p-4 text-sm">
          <h3 className="font-semibold">Sources after acceptance</h3>
          {review.sourceChanges.after.map(source => <p key={source.id}><strong>{source.name}</strong> · {source.directory}{source.aliases?.length ? ` · aliases: ${source.aliases.join(', ')}` : ''}</p>)}
          {review.sourceChanges.before.filter(source => !review.sourceChanges!.after.some(after => after.id === source.id)).map(source => <p key={source.id}>Remove <strong>{source.name}</strong> from this bundle.</p>)}
          {review.sourceChanges.stale && <p role="alert" className="text-amber-800">Bundle settings changed. Choose Check again before accepting this proposal.</p>}
          {review.sourceChanges.outputPathsChange && <p className="rounded bg-amber-50 p-3 text-amber-900">Generated page paths will change. For a published bundle, we recommend creating a new generated version, publishing a connected revision, and retaining the prior publication. Readers can use Open the newer version to reach the same pages at their new paths. You can keep working without publishing.</p>}
        </section>}
        {groups.size > 0 && <section className="space-y-3">
          <h3 className="text-sm font-semibold">Renames and moves<SourceChangeCount count={groups.size} /></h3>
          {[...groups].map(([id, moves]) => {
            const selected = proposedResolutions[id];
            const displayed = moves.find(move => move.newPath === selected) ?? moves[0];
            return <article key={id} className="min-w-0 border-b border-neutral-100 pb-3 last:border-0 last:pb-0" data-testid={`source-move-${id}`}>
              <details className="text-xs text-neutral-500">
                <summary className="ml-3 cursor-pointer rounded hover:bg-neutral-50 [list-style-position:outside]" aria-label={`Details ${displayed.oldPath} → ${displayed.newPath}`}>
                  {selected !== null ? <PathChange before={displayed.oldPath} after={displayed.newPath} /> : <span className="space-y-1 text-sm"><span className="block font-medium text-neutral-600">Separate pages</span><span className="block"><SourcePath value={displayed.oldPath} /></span><span className="block"><SourcePath value={displayed.newPath} /></span></span>}
                </summary>
                <fieldset className="mt-3 space-y-3 rounded border border-neutral-200 p-3" disabled={busy || backgroundBusy}>
                  <legend className="px-1">Page identity</legend>
                  {moves.map(move => <div key={move.newPath} className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm"><input className="mt-1 accent-main-600" type="radio" name={`move-${id}`} checked={selected === move.newPath} onChange={() => setResolutions(previous => ({ ...previous, [id]: move.newPath }))} />
                      <span>Same page <span className="text-neutral-500">— keep its identity and settings</span>{moves.length > 1 && <span className="mt-1 block text-xs [overflow-wrap:anywhere]"><SourcePath value={move.newPath} /></span>}</span>
                    </label>
                    <p className="pl-5">{move.evidence.join(' · ')}</p>
                    <MoveTraversal move={move} graphs={traversal.graphs} onDetails={traversal.show} />
                    {move.contentChanged && <button className="ml-5 text-main-700 hover:underline" onClick={() => void inspect(move.oldPath, move.newPath)}>Compare content{moves.length > 1 && <span className="sr-only">: {move.newPath}</span>}</button>}
                    {comparison?.beforePath === move.oldPath && comparison.afterPath === move.newPath && <ContentComparison comparison={comparison} imageUrl={imageUrl} />}
                  </div>)}
                  <label className="flex cursor-pointer items-start gap-2 border-t border-neutral-100 pt-3 text-sm"><input className="mt-1 accent-main-600" type="radio" name={`move-${id}`} checked={selected === null} onChange={() => setResolutions(previous => ({ ...previous, [id]: null }))} /><span>Different pages <span className="text-neutral-500">— remove the old configuration; the new page is untracked</span></span></label>
                </fieldset>
              </details>
            </article>;
          })}
        </section>}
        {Boolean(review?.changes.length) && <section aria-label="Source content changes">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 className="text-sm font-semibold">{groups.size ? 'Also in this update' : 'Source changes'}<SourceChangeCount count={review?.changes.length ?? 0} /></h3>
            {hasAddedPages && <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-main-600" checked={trackNewPages} disabled={busy || backgroundBusy} aria-describedby={trackNewPagesHintId} onChange={event => setTrackNewPages(event.target.checked)} />Track non-sensitive added pages</label>
              <span className="group relative inline-flex">
                <button type="button" aria-label="About tracking added pages" aria-describedby={trackNewPagesHintId} className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[10px] text-neutral-500">?</button>
                <span id={trackNewPagesHintId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] -ml-2 w-80 max-w-[calc(100vw-3rem)] -translate-x-full rounded border border-neutral-200 bg-white p-3 text-xs font-normal text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">Automatically track new pages after accepting the source changes. Pages marked sensitive directly or by an enabled filter stay untracked.</span>
              </span>
            </div>}
          </div>
          <div className="divide-y divide-neutral-100">{orderedChanges.slice(0, showAllChanges ? undefined : 8).map(change => <SourceChangeRow imageUrl={imageUrl} key={`${review!.reviewToken}:${change.kind}:${change.path}`} change={change} sensitivity={review?.trackingSensitivity?.[change.path]} graph={traversal.graphs.candidate} onTraversalDetails={traversal.graphs.candidate?.getNode(change.path)?.path?.length ? () => traversal.show('candidate', change.path) : undefined} loadComparison={async () => {
            const query = new URLSearchParams({ beforeId: review!.accepted.id, afterId: review!.candidate!.id, beforePath: change.previousPath ?? change.path, afterPath: change.path });
            return { beforePath: change.previousPath ?? change.path, afterPath: change.path, ...await request(`/comparison?${query}`) };
          }} />)}</div>
          {(review?.changes.length ?? 0) > 8 && <button className="mt-2 text-xs text-main-700 hover:underline" onClick={() => setShowAllChanges(previous => !previous)}>{showAllChanges ? 'Show fewer' : `Show all ${review?.changes.length} changes`}</button>}
        </section>}
        {review && review.orphans.length > 0 && <OrphanReview orphans={review.orphans} hasCandidate={Boolean(review.candidate)} keeps={orphanKeeps} onKeepChange={(id, keep) => setOrphanKeeps(previous => keep ? [...previous, id] : previous.filter(item => item !== id))} />}

      </div>
    </Modal></SourceNamesProvider>, document.body)}
    {open && traversal.details && createPortal(<TraversalPathDetailsModal isOpen onClose={traversal.close} {...traversal.details} manageFocus />, document.body)}
  </>;
}
