/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import React from 'react';

export function SensitivityBadge({ sourceSensitive, filterNames }: { sourceSensitive: boolean; filterNames: string[] }) {
  const helpId = React.useId();
  return <span className="group relative inline-flex items-center gap-1">
    <span className="inline-block rounded-full bg-danger-100 px-2 py-0.5 text-xs text-danger-800">Sensitive</span>
    <button type="button" aria-label="Why this node is sensitive" aria-describedby={helpId}
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[10px] leading-none text-neutral-500">?</button>
    <span id={helpId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] -ml-2 w-64 max-w-[calc(100vw-3rem)] -translate-x-full rounded border border-neutral-200 bg-white p-3 text-left text-xs font-normal text-neutral-700 opacity-0 shadow-lg group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      {sourceSensitive ? <><code>meadow-sensitive</code> is marked in the source.</> : <>
        Marked sensitive by {filterNames.length === 1 ? 'this enabled filter' : 'these enabled filters'}:
        <span className="mt-1 block space-y-1">{filterNames.map(name => <span key={name} className="block">{name}</span>)}</span>
      </>}
    </span>
  </span>;
}
