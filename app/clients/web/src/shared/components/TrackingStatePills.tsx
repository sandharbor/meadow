/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export type TrackingState = 'tracked' | 'untracked' | 'blacklisted';

const pill = 'inline-block px-2 py-0.5 rounded-full text-xs';

/** The tracked and blacklisted pills shown for a page. A blacklisted page is tracked with a blacklist record. `removed` marks untracking by removal. */
export function TrackingStatePills({ state, removed = false }: { state: TrackingState; removed?: boolean }) {
  return <span className="inline-flex flex-wrap gap-1">
    <span className={`${pill} ${state === 'untracked' ? 'bg-neutral-100 text-neutral-800' : 'bg-success-100 text-success-800'}`}>{state === 'untracked' ? 'Not Tracked' : 'Tracked'}{removed && ' (removed)'}</span>
    {state === 'blacklisted' && <span className={`${pill} bg-danger-100 text-danger-800`}>Blacklisted</span>}
  </span>;
}
