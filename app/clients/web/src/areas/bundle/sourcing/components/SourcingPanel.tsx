/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../../../shared/components/Modal.js';
import { proposedSourceMoveResolutions } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { OrphanReview } from './OrphanReview.js';
import DiffView from '../../../../../shared_components/ConfigFileExplorer/DiffView.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { Spinner } from '../../../../shared/components/Spinner.js';
import type { SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import './SourcingPanel.css';
import { apiRequest } from '../../../../shared/utils/apiClient.js';

function date(value: string): string { return new Date(value).toLocaleString(); }
function time(value: string): string { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

interface Comparison { beforePath: string; afterPath: string; before: string | null; after: string | null; binary: boolean; }
function ContentComparison({ comparison }: { comparison: Comparison }) {
  return <section aria-label="Source content comparison" className="mt-3 overflow-hidden rounded border border-neutral-200">
    {comparison.binary ? <p className="p-3 text-sm text-neutral-600">Binary file. Use the matching evidence to compare its contents.</p> : <>
      <div className="border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500">Accepted source <span aria-hidden="true">→</span> Candidate source</div>
      <div className="max-h-80 overflow-auto [&>div]:h-auto">
        <DiffView key={`${comparison.beforePath}:${comparison.afterPath}`} originalContent={comparison.before} currentContent={comparison.after ?? ''} isNewFile={comparison.before === null} isDeletedFile={comparison.after === null} codeOnly wrapLines lineLabels={{ before: 'Accepted source', after: 'Candidate source' }} unchangedLabel="No content changes" />
      </div>
    </>}
  </section>;
}

function SourcePath({ value }: { value: string }) {
  const separator = value.lastIndexOf('/');
  return <span className="min-w-0 [overflow-wrap:anywhere]" title={value}>{separator >= 0 && <span className="text-neutral-500">{value.slice(0, separator + 1)}</span>}<span>{value.slice(separator + 1)}</span></span>;
}

export function SourcingPanel({ bundleSlug, hasDraftChanges, onAccepted, sourceChangeTrigger = 0, reviewTrigger = 0, onReviewOpened }: {
  sourceChangeTrigger?: number;
  reviewTrigger?: number;
  onReviewOpened?: () => void;
  bundleSlug: string; hasDraftChanges: boolean; onAccepted: () => void;
}) {
  const [review, setReview] = useState<SourcingReview | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const foregroundScan = useRef(false);
  const reviewOpen = useRef(false);
  reviewOpen.current = open;
  const [noChanges, setNoChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanRemovals, setOrphanRemovals] = useState<Set<string>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, string | null>>({});
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const requestGeneration = useRef(0);
  const inFlight = useRef(false);
  const reviewToken = useRef<string>();
  const [showAllChanges, setShowAllChanges] = useState(false);
  const closeReview = useCallback(() => setOpen(false), []);
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
    if (reviewToken.current !== result.reviewToken) { setResolutions({}); setOrphanRemovals(new Set()); setComparison(null); setShowAllChanges(false); }
    reviewToken.current = result.reviewToken;
    setReview(result);
    setNoChanges(announceNoChanges && !result.candidate && result.orphans.length === 0);
  }, []);

  const scan = useCallback(async (replaceCandidate = false, background = false) => {
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
    try {
      const result = await request('/scan', { replaceCandidate }) as SourcingReview;
      if (generation === requestGeneration.current) receive(result, foregroundScan.current);
    } catch (err) { if (generation === requestGeneration.current) setError(err instanceof Error ? err.message : String(err)); }
    finally {
      if (generation === requestGeneration.current) { inFlight.current = false; setBusy(false); setBackgroundBusy(false); }
    }
  }, [request, receive]);

  useEffect(() => {
    requestGeneration.current += 1;
    inFlight.current = false;
    reviewToken.current = undefined;
    setBackgroundBusy(false);
    setReview(null); setResolutions({}); setComparison(null); setError(null); setOpen(false);
    void scan(true);
    const timer = window.setInterval(() => {
      if (!document.hidden) void scan(!reviewOpen.current, true);
    }, 30000);
    return () => { requestGeneration.current += 1; window.clearInterval(timer); };
  }, [scan]);

  useEffect(() => {
    if (busy || !noChanges) return;
    const timer = window.setTimeout(() => setNoChanges(false), 2000);
    return () => window.clearTimeout(timer);
  }, [busy, noChanges]);

  useEffect(() => {
    if (sourceChangeTrigger) void scan(true);
  }, [sourceChangeTrigger, scan]);

  useEffect(() => {
    if (reviewTrigger) { setOpen(true); onReviewOpened?.(); }
  }, [reviewTrigger, onReviewOpened]);

  const inspect = async (oldPath: string, newPath: string) => {
    if (!review?.candidate) return;
    try {
      const query = new URLSearchParams({ beforeId: review.accepted.id, afterId: review.candidate.id, beforePath: oldPath, afterPath: newPath });
      const result = await request(`/comparison?${query}`);
      setComparison({ beforePath: oldPath, afterPath: newPath, ...result });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const accept = async () => {
    if (!review || (!review.candidate && orphanRemovals.size === 0)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      receive(await request('/accept', { candidateId: review.candidate?.id ?? review.accepted.id, reviewToken: review.reviewToken, resolutions, orphanRemovals: [...orphanRemovals] }) as SourcingReview);
      setOpen(false); setComparison(null); setResolutions({}); onAccepted();
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
  const proposedResolutions = proposedSourceMoveResolutions(review?.moves ?? [], resolutions);

  return <>
    <div className="flex items-center gap-2 whitespace-nowrap text-sm" data-testid="sourcing-status" data-orphan-count={review?.orphans.length ?? 0} aria-live="polite">
      {busy ? <span role="status" className="flex items-center gap-2 text-neutral-500"><Spinner />Updating sources</span>
        : review && (review.candidate || review.orphans.length > 0) ? <button aria-busy={backgroundBusy} className="relative overflow-hidden rounded bg-blue-100 px-3 py-1 font-medium text-blue-900" onClick={() => setOpen(true)}>{reviewLabel}{backgroundProgress}</button>
        : noChanges ? <span role="status" className="text-neutral-500">No changes</span>
        : <button aria-busy={backgroundBusy} className="relative overflow-hidden rounded px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-800" onClick={() => void scan(true)}>Update sources{backgroundProgress}</button>}
      {error && !open && <span role="alert" title={error} className="text-red-700">Source update failed<span className="sr-only">: {error}</span></span>}
    </div>
    {open && createPortal(<Modal isOpen={open} onClose={closeReview} title="Source update" ariaLabel="Source review" closeLabel="Close source review" manageFocus className="w-full max-w-3xl" footer={
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto text-xs text-neutral-500" role="status">{hasDraftChanges ? 'Save or undo curation changes before accepting.'  : orphanRemovals.size ? `${orphanRemovals.size} entr${orphanRemovals.size === 1 ? 'y' : 'ies'} will be removed from config.` : ''}</p>
        <button className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50" onClick={closeReview}>Later</button>
        {(review?.candidate || orphanRemovals.size > 0) && <button className="rounded bg-btn-confirm-normal px-4 py-2 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:opacity-50" disabled={busy || backgroundBusy || hasDraftChanges} onClick={() => void accept()}>{review?.candidate ? 'Accept source update' : 'Apply removals'}</button>}
      </div>
    }>
      <div className="space-y-5 text-neutral-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          {review?.candidate ? <><span title={date(review.candidate.capturedAt)}>Captured {time(review.candidate.capturedAt)}</span><span>· {changeCount} change{changeCount === 1 ? '' : 's'}</span></>
            : <span>{busy ? 'Checking sources…' : review?.orphans.length ? `${review.orphans.length} orphaned entries to review` : 'No source changes are waiting.'}</span>}
          <button className="ml-auto text-main-700 hover:underline disabled:opacity-50" disabled={busy || backgroundBusy} onClick={() => void scan(true)}>{busy || backgroundBusy ? 'Checking…' : 'Check again'}</button>
        </div>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {groups.size > 0 && <section className="space-y-3">
          <h3 className="text-sm font-semibold">Renames and moves <span className="font-normal text-neutral-500">({groups.size})</span></h3>
          {[...groups].map(([id, moves]) => {
            const selected = proposedResolutions[id];
            const displayed = moves.find(move => move.newPath === selected) ?? moves[0];
            return <article key={id} className="min-w-0 border-b border-neutral-100 pb-3 last:border-0 last:pb-0" data-testid={`source-move-${id}`}>
              {selected !== null ? <PathChange before={displayed.oldPath} after={displayed.newPath} /> : <div className="space-y-1 text-sm"><p className="font-medium text-neutral-600">Separate pages</p><p><SourcePath value={displayed.oldPath} /></p><p><SourcePath value={displayed.newPath} /></p></div>}
              <details className="mt-2 text-xs text-neutral-500">
                <summary className="cursor-pointer hover:text-neutral-800">Details</summary>
                <fieldset className="mt-3 space-y-3 rounded border border-neutral-200 p-3" disabled={busy || backgroundBusy}>
                  <legend className="px-1">Page identity</legend>
                  {moves.map(move => <div key={move.newPath} className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-2 text-sm"><input className="mt-1 accent-main-600" type="radio" name={`move-${id}`} checked={selected === move.newPath} onChange={() => setResolutions(previous => ({ ...previous, [id]: move.newPath }))} />
                      <span>Same page <span className="text-neutral-500">— keep its identity and settings</span>{moves.length > 1 && <span className="mt-1 block text-xs [overflow-wrap:anywhere]">{move.newPath}</span>}</span>
                    </label>
                    <p className="pl-5">{move.evidence.join(' · ')}</p>
                    <details className="pl-5"><summary className="cursor-pointer hover:text-neutral-800">Traversal details</summary>
                      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 [overflow-wrap:anywhere]">
                        <dt>From</dt><dd>{move.oldPath}</dd><dt>To</dt><dd>{move.newPath}</dd>
                        <dt>Before</dt><dd>{move.previousRoute.length ? move.previousRoute.join(' → ') : 'No previously reachable route recorded.'}</dd>
                        <dt>After</dt><dd>{move.currentRoute.length ? move.currentRoute.join(' → ') : 'Not reached by the current traversal. Accepting its identity can still leave it orphaned.'}</dd>
                      </dl>
                    </details>
                    <button className="ml-5 text-main-700 hover:underline" onClick={() => void inspect(move.oldPath, move.newPath)}>Compare content{moves.length > 1 && <span className="sr-only">: {move.newPath}</span>}</button>
                    {comparison?.beforePath === move.oldPath && comparison.afterPath === move.newPath && <ContentComparison comparison={comparison} />}
                  </div>)}
                  <label className="flex cursor-pointer items-start gap-2 border-t border-neutral-100 pt-3 text-sm"><input className="mt-1 accent-main-600" type="radio" name={`move-${id}`} checked={selected === null} onChange={() => setResolutions(previous => ({ ...previous, [id]: null }))} /><span>Different pages <span className="text-neutral-500">— keep them separate</span></span></label>
                </fieldset>
              </details>
            </article>;
          })}
        </section>}
        {review && review.orphans.length > 0 && <OrphanReview orphans={review.orphans} removals={orphanRemovals} onRemovalsChange={setOrphanRemovals} disabled={busy || backgroundBusy || hasDraftChanges} hasCandidate={Boolean(review.candidate)} />}
        {Boolean(review?.changes.length) && <section><h3 className="mb-2 text-sm font-semibold">{groups.size ? 'Also in this update' : 'Source changes'} <span className="font-normal text-neutral-500">({review?.changes.length})</span></h3>
          <div className="divide-y divide-neutral-100">{review?.changes.slice(0, showAllChanges ? undefined : 8).map(change => <div className="py-2.5 text-sm" key={`${change.kind}:${change.path}`}>
            <div className="flex items-start gap-3"><span className="w-16 shrink-0 pt-0.5 text-xs text-neutral-500">{change.kind === 'missing' ? 'Missing' : change.kind === 'added' ? 'Added' : 'Modified'}</span><div className="min-w-0 flex-1"><SourcePath value={change.path} /></div>
              <button className="shrink-0 text-xs text-main-700 hover:underline" aria-label={`Inspect ${change.path}`} onClick={() => void inspect(change.path, change.path)}>Inspect</button>
            </div>
            {comparison?.beforePath === change.path && comparison.afterPath === change.path && <ContentComparison comparison={comparison} />}
          </div>)}</div>
          {(review?.changes.length ?? 0) > 8 && <button className="mt-2 text-xs text-main-700 hover:underline" onClick={() => setShowAllChanges(previous => !previous)}>{showAllChanges ? 'Show fewer' : `Show all ${review?.changes.length} changes`}</button>}
        </section>}
        <div className="space-y-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <details><summary className="cursor-pointer hover:text-neutral-800">Snapshot details and history ({review?.history.length ?? 0})</summary>
            <p className="mt-3">The accepted snapshot supplies curation and generation until you accept an update.</p>
            {review?.candidate && <p className="mt-2">Candidate: {date(review.candidate.capturedAt)} · {review.candidate.fileCount} source files</p>}
            <ul className="mt-2 space-y-2">{review?.history.slice().reverse().map(item => <li key={item.id}>{date(item.capturedAt)} · {item.fileCount} files{item.id === review.accepted.id ? ' · Accepted' : ''}</li>)}</ul>
          </details>
        </div>
      </div>
    </Modal>, document.body)}
  </>;
}
