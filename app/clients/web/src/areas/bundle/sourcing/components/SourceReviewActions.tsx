/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ReactNode, RefObject } from 'react';
import { Spinner } from '../../../../shared/components/Spinner.js';

/** What accepting applies points into Accept changes; leaving is the quiet action after it. */
export function SourceReviewActions({ busy, blocked, loading = false, acceptButton, refresh, changes, onExit, onAccept }: {
  busy: boolean;
  /** While what Accept would apply is still being worked out, a spinner waits where the changes will appear. */
  loading?: boolean;
  refresh?: ReactNode;
  blocked: boolean;
  acceptButton?: RefObject<HTMLButtonElement>;
  changes?: ReactNode;
  onExit: () => void;
  onAccept: () => void;
}) {
  return <div className="ml-auto flex min-w-0 items-center gap-2">
    {refresh && <span className="mr-0.5 shrink-0">{refresh}</span>}
    {changes}
    {/* The spinner sits 10px left of Accept without taking space, so it fades out as the changes fade in beside it. */}
    <span className="relative w-0 shrink-0 self-stretch">
      <span data-testid="source-review-loading" role={loading ? 'status' : undefined} aria-label={loading ? 'Loading page changes' : undefined}
        className={`absolute right-0.5 top-1/2 flex -translate-y-1/2 transition-opacity duration-200 ${loading ? 'opacity-100' : 'pointer-events-none opacity-0'}`}><Spinner /></span>
    </span>
    <button ref={acceptButton} className="shrink-0 rounded bg-blue-700 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy || blocked} onClick={onAccept}>Accept changes</button>
    {/* A close control: its accessible name stays Exit, and it still asks whether to keep the proposal. */}
    <button aria-label="Exit" title="Exit changes review" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-blue-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy} onClick={onExit}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 2 10 10M10 2 2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
  </div>;
}
