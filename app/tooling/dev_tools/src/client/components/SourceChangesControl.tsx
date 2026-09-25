/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useId, useState } from 'react';
import { SOURCE_CHANGE_CATEGORIES, type SourceChangeCategory, type SourceChangeStatus } from '../../../../../shared_code/shared_dev/sourceChangesTypes.js';
import type { FixtureSourceLocation } from '../../../../../shared_code/shared_dev/fixtureSourceLocation.js';
import type { OpenSavedState, ServiceTarget } from '../../shared/types';
import { displaySourceChangeOperations } from './sourceChangePresentation.js';
import { openSavedStateRequest, requestJson, type LaunchMode } from './SavedStatesManager.js';
import { SplitOpenButton } from './SplitOpenButton.js';

function descriptionText(value: string) {
  return value.split(/(`[^`]+`)/g).map((part, index) => part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

export function SourceChangesControl({ fixtureName, pending, launchMode, openStateId, onOpened }: {
  fixtureName: string;
  pending: boolean;
  launchMode: LaunchMode;
  /** Reload statuses whenever a different saved state is opened. */
  openStateId: string | null;
  onOpened: (state: OpenSavedState) => void;
}) {
  const fixtureActionPending = pending;
  const [category, setCategory] = useState<SourceChangeCategory>('add');
  const tabsId = useId();
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SourceChangeStatus[]>([]);
  const [active, setActive] = useState(false);
  const [sourceLocations, setSourceLocations] = useState<FixtureSourceLocation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/config/fixtures/${encodeURIComponent(fixtureName)}/source-changes`;
  const availableCategories = SOURCE_CHANGE_CATEGORIES.filter(item => changes.some(change => change.categories[0] === item));
  const selectedCategory = availableCategories.includes(category) ? category : availableCategories[0];

  const load = useCallback(async () => {
    const response = await fetch(endpoint);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load source changes');
    setChanges(result.changes);
    setActive(result.active);
    setSourceLocations(result.sourceLocations);
  }, [endpoint]);
  useEffect(() => {
    if (!open || fixtureActionPending) return;
    const refresh = () => { void load().catch(err => setError(err instanceof Error ? err.message : String(err))); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [open, openStateId, fixtureActionPending, load]);

  const apply = async (change: SourceChangeStatus) => {
    setBusy(change.id); setError(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(change.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceGraph: change.sourceGraph }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not apply source change');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };

  const start = async (change: SourceChangeStatus, serviceTarget: ServiceTarget) => {
    setBusy(change.id); setError(null);
    try {
      await requestJson(`/api/source-scenarios/${encodeURIComponent(change.id)}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ launch: launchMode, serviceTarget }),
      });
      onOpened((await requestJson<{ current: OpenSavedState }>('/api/saved-states')).current);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };

  const openCheckpoint = async (change: SourceChangeStatus, index: number, serviceTarget: ServiceTarget) => {
    const latest = change.latestE2e;
    if (!latest?.slug) return;
    setBusy(`${change.id}:${index}`); setError(null);
    try {
      const result = await openSavedStateRequest({ kind: 'checkpoint', runId: latest.runId, scenario: latest.slug, checkpoint: index }, serviceTarget, launchMode);
      onOpened(result.state);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };

  return <details className="mt-3 border-t border-info-200 pt-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label="Source changes" className="cursor-pointer text-sm font-medium text-info-800">
      Source changes
      <span className="group relative ml-2 inline-flex">
        <button type="button" aria-label="About source changes" aria-describedby={`${tabsId}-help`} onClick={event => event.preventDefault()} className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[10px] text-neutral-500">?</button>
        <span id={`${tabsId}-help`} role="tooltip" className="pointer-events-none invisible fixed z-[9999] ml-2 w-80 max-w-[calc(100vw-2rem)] rounded border border-neutral-200 bg-white p-3 text-xs font-normal text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          Start opens the change&apos;s designated scenario fixture, accepts its baseline, applies the change, and opens review or source repair. Apply changes only the files of the open saved state. Each recorded checkpoint opens exactly what the E2E scenario saw.
        </span>
      </span>
    </summary>
    {open && <div className="mt-3 space-y-3" data-testid="source-changes-control" aria-busy={fixtureActionPending || busy !== null}>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div role="tablist" aria-label="Source change categories" className="flex gap-0.5 overflow-x-auto border-b border-neutral-200">
        {SOURCE_CHANGE_CATEGORIES.map(item => <button key={item} id={`${tabsId}-${item}`} role="tab" disabled={!availableCategories.includes(item)} aria-selected={selectedCategory === item} aria-controls={`${tabsId}-panel`} tabIndex={selectedCategory === item ? 0 : -1} className={`shrink-0 border-b-2 px-2 py-2 text-sm capitalize disabled:cursor-not-allowed disabled:text-neutral-300 ${selectedCategory === item ? 'border-info-600 font-semibold text-info-800' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`} onClick={() => setCategory(item)} onKeyDown={event => {
          const index = availableCategories.indexOf(item);
          const next = event.key === 'ArrowRight' ? (index + 1) % availableCategories.length
            : event.key === 'ArrowLeft' ? (index + availableCategories.length - 1) % availableCategories.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? availableCategories.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); setCategory(availableCategories[next]);
          event.currentTarget.parentElement?.querySelectorAll('button')[SOURCE_CHANGE_CATEGORIES.indexOf(availableCategories[next])]?.focus();
        }}>{item}</button>)}
      </div>
      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={selectedCategory ? `${tabsId}-${selectedCategory}` : undefined} className="space-y-2">
        {changes.filter(change => change.categories[0] === selectedCategory).map(change => <article data-testid={`source-change-${change.id}`} key={`${change.sourceGraph}:${change.id}`} className={`relative rounded border border-neutral-200 p-3 ${active && change.state !== 'available' ? 'bg-neutral-100 text-neutral-500 opacity-60' : 'bg-white'}`}>
          <details className="min-w-0">
            <summary className="min-h-6 cursor-pointer pr-32 text-sm font-semibold">{change.label}</summary>
            <div className="mt-3 space-y-2 text-xs text-neutral-600">
              <dl className="space-y-2">
                <div><dt className="inline font-semibold">Action:</dt>{' '}<dd className="inline">{descriptionText(change.action)}</dd></div>
                <div><dt className="inline font-semibold">Check:</dt>{' '}<dd className="inline">{descriptionText(change.check)}</dd></div>
                <div><dt className="inline font-semibold">E2E:</dt>{' '}<dd className="inline">{change.latestE2e
                  ? <><time>{change.latestE2e.runId.slice(0, 19).replace('_', ' ').replace(/(\d{2})-(\d{2})-(\d{2})$/, '$1:$2:$3')}</time>{' — '}<a className="text-info-700 underline hover:text-info-900" href={change.latestE2e.url} target="_blank" rel="noreferrer">{change.latestE2e.scenario}</a></>
                  : <span>No recorded run yet ({change.e2e.replace('.spec.ts', '')})</span>}</dd></div>
              </dl>
              {change.latestE2e?.checkpoints && change.latestE2e.checkpoints.length > 0 && <div data-testid={`source-change-checkpoints-${change.id}`}>
                <h4 className="font-medium">Checkpoints</h4>
                <ol className="mt-1 space-y-2">
                  {change.latestE2e.checkpoints.map(checkpoint => <li key={checkpoint.index} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">{checkpoint.index}. {checkpoint.message}</span>
                    <div className="shrink-0">
                      <SplitOpenButton
                        label="Open"
                        compact
                        testId={`open-checkpoint-${change.id}-${checkpoint.index}`}
                        targets={{
                          local: { available: checkpoint.openable, reason: checkpoint.unavailableReason },
                          hosted: { available: checkpoint.hostedAvailable, reason: checkpoint.unavailableReason ?? checkpoint.hostedUnavailableReason },
                        }}
                        busy={busy === `${change.id}:${checkpoint.index}`}
                        disabled={fixtureActionPending || (busy !== null && busy !== `${change.id}:${checkpoint.index}`)}
                        onOpen={target => void openCheckpoint(change, checkpoint.index, target)}
                      />
                    </div>
                  </li>)}
                </ol>
              </div>}
              {active && change.state === 'conflict' && change.reason && <p>{change.reason}</p>}
              <h4 className="font-medium">Files & operations</h4>
              <pre className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(displaySourceChangeOperations(change, sourceLocations), null, 2)}</pre>
            </div>
          </details>
          <div className="absolute right-3 top-3 flex gap-2">
            <button className="shrink-0 rounded bg-info-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50" disabled={fixtureActionPending || busy !== null} onClick={() => void start(change, 'local')}>Start</button>
            <button className="shrink-0 rounded bg-info-600 px-3 py-1 text-xs font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-600" disabled={!active || fixtureActionPending || busy !== null || change.state !== 'available'} onClick={() => void apply(change)}>Apply</button>
          </div>
        </article>)}
      </div>
    </div>}
  </details>;
}
