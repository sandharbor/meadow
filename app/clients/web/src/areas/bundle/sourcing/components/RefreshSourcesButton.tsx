/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function RefreshSourcesButton({ compact = false, refreshing, disabled, backgroundBusy = false, noChanges = false, onClick, children }: {
  compact?: boolean;
  refreshing: boolean;
  disabled: boolean;
  backgroundBusy?: boolean;
  noChanges?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  const [arrowPhase, setArrowPhase] = useState<'idle' | 'spinning' | 'fade-out' | 'fade-in'>(refreshing ? 'spinning' : 'idle');
  const wasRefreshing = useRef(refreshing);
  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true;
      setArrowPhase('spinning');
      return;
    }
    if (!wasRefreshing.current) return;
    wasRefreshing.current = false;
    setArrowPhase('fade-out');
    const reset = window.setTimeout(() => setArrowPhase('fade-in'), 125);
    const finish = window.setTimeout(() => setArrowPhase('idle'), 250);
    return () => { window.clearTimeout(reset); window.clearTimeout(finish); };
  }, [refreshing]);
  const spinning = refreshing || arrowPhase === 'spinning' || arrowPhase === 'fade-out';

  return <button type="button" aria-label="Refresh sources" title="Refresh sources" aria-busy={refreshing || backgroundBusy} disabled={disabled} onClick={onClick}
    className={`relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded border border-neutral-300 bg-neutral-50 py-1 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main-500 disabled:cursor-default disabled:opacity-60 ${compact ? 'px-1.5' : 'px-3'}`}>
    <span aria-hidden="true" className={`inline-flex shrink-0 ${arrowPhase === 'fade-out' ? 'motion-safe:animate-[source-refresh-fade-out_125ms_ease-in_both]' : arrowPhase === 'fade-in' ? 'motion-safe:animate-[source-refresh-fade-in_125ms_ease-out_both]' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${spinning ? 'motion-safe:animate-spin' : ''}`}>
        <path d="M20 4v5h-5" />
        <path d="M19.5 15a8 8 0 1 1-1.9-8.3L20 9" />
      </svg>
    </span>
    {refreshing && <span role="status" className="sr-only">Refreshing sources</span>}
    {!compact && <span className="relative">
      <span aria-hidden={noChanges || undefined} className={noChanges ? 'invisible' : undefined}>Refresh sources</span>
      {noChanges && <span role="status" className="absolute inset-0 text-center text-neutral-500 motion-safe:animate-[source-no-changes_2s_ease-in-out_both]">No changes</span>}
    </span>}
    {children}
  </button>;
}
