/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { RefObject } from 'react';

export function SourceReviewActions({ busy, blocked, acceptButton, onExit, onAccept }: {
  busy: boolean;
  blocked: boolean;
  acceptButton?: RefObject<HTMLButtonElement>;
  onExit: () => void;
  onAccept: () => void;
}) {
  return <div className="ml-auto flex shrink-0 items-center gap-3">
    <button className="rounded border border-neutral-300 bg-white px-3 py-2 font-semibold hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy} onClick={onExit}>Exit</button>
    <button ref={acceptButton} className="rounded bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy || blocked} onClick={onAccept}>Accept changes</button>
  </div>;
}
