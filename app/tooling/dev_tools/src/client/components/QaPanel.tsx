/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { OpenSavedState, PlaceArrival } from '../../shared/types';
import { describeAppPlace, parseAppPlace } from '../../../../../contracts/places/index.js';

function describe(path: string): string {
  try {
    return describeAppPlace(parseAppPlace(path).place);
  } catch {
    return path;
  }
}

function shortRevision(revision: string, uncommitted: boolean): string {
  return `${revision.slice(0, 7)}${uncommitted ? ' (+uncommitted)' : ''}`;
}

function originText(state: OpenSavedState): string {
  switch (state.origin.kind) {
    case 'normal': return 'Your real Meadow Home';
    case 'empty': return 'Empty Home (fresh install)';
    case 'fixture': return `Home fixture ${state.label}`;
    case 'checkpoint': return `Checkpoint ${state.origin.checkpoint} of an E2E run`;
  }
}

/** "What am I QA-ing?" — the single answer to what the app is running against. */
export function QaPanel({ state, arrival }: { state: OpenSavedState; arrival?: PlaceArrival | null }) {
  const run = state.checkpoint;
  const codeDiffers = run && (run.runCodeRevision !== state.currentCode.revision || run.runUncommittedCode || state.currentCode.uncommitted);
  return <section aria-labelledby="qa-panel-title" data-testid="qa-panel" className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
    <h2 id="qa-panel-title" className="text-sm font-semibold text-neutral-800">What am I QA-ing?</h2>
    {state.notice && <p role="status" className="mt-2 rounded border border-warning-200 bg-warning-50 p-2 text-sm text-warning-800">{state.notice}</p>}
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-neutral-500">Saved state</dt>
      <dd data-testid="qa-origin" className="font-medium text-neutral-900">{originText(state)}</dd>
      {run && <>
        <dt className="text-neutral-500">Checkpoint</dt>
        <dd data-testid="qa-checkpoint">
          <span className="font-medium">{run.message}</span>
          <span className="text-neutral-500"> in {run.scenarioTitle} · </span>
          <a className="text-info-700 underline hover:text-info-900" href={run.reportUrl} target="_blank" rel="noreferrer">View in report</a>
        </dd>
        <dt className="text-neutral-500">Code</dt>
        <dd data-testid="qa-code" className={codeDiffers ? 'text-warning-800' : 'text-neutral-700'}>
          Run at <code>{shortRevision(run.runCodeRevision, run.runUncommittedCode)}</code>; you&apos;re at <code>{shortRevision(state.currentCode.revision, state.currentCode.uncommitted)}</code>
        </dd>
      </>}
      {state.formatUpgrade && <>
        <dt className="text-neutral-500">Home format</dt>
        <dd data-testid="qa-format-upgrade" className="text-warning-800">Home upgraded from format {state.formatUpgrade.from} → {state.formatUpgrade.to} on open</dd>
      </>}
      {state.requestedPlace && <>
        <dt className="text-neutral-500">Opened at</dt>
        <dd data-testid="qa-place" className={arrival?.notice ? 'text-warning-800' : 'text-neutral-700'}>
          {arrival ? (arrival.notice ?? describe(arrival.reached)) : <span className="text-neutral-500">Waiting for the app to open {describe(state.requestedPlace)}…</span>}
        </dd>
      </>}
      <dt className="text-neutral-500">Services</dt>
      <dd data-testid="qa-service-target">
        {state.serviceTarget === 'local' ? 'Local' : state.origin.kind === 'normal' ? 'As configured in your Meadow Home' : 'Hosted Development'}
        {state.partition && <span className="text-neutral-500"> · partition <code>{state.partition}</code>{state.localServiceParts?.length ? ` (${state.localServiceParts.join(', ')})` : ''}</span>}
      </dd>
      <dt className="text-neutral-500">Home</dt>
      <dd><code data-testid="qa-home" className="break-all text-xs">{state.homeDirectory}</code></dd>
    </dl>
  </section>;
}
