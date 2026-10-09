/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ReactNode, RefObject } from 'react';

/** What accepting applies points into Accept changes; leaving is the quiet action after it. */
export function SourceReviewActions({ busy, blocked, acceptButton, refresh, changes, onExit, onAccept }: {
  busy: boolean;
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
    <button ref={acceptButton} className="shrink-0 rounded bg-blue-700 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy || blocked} onClick={onAccept}>Accept changes</button>
    {/* A close control: its accessible name stays Exit, and it still asks whether to keep the proposal. */}
    <button aria-label="Exit" title="Exit changes review" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-blue-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy} onClick={onExit}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 2 10 10M10 2 2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </button>
  </div>;
}
