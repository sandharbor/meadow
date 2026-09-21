/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useSourcePath } from './SourceNames.js';

/** Preserve whole words and path segments so common text can recede without hiding the change. */
export function splitPathChange(before: string, after: string) {
  const left = before.split(/(\s+|\/|[._-]+)/).filter(Boolean);
  const right = after.split(/(\s+|\/|[._-]+)/).filter(Boolean);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let end = 0;
  while (end < left.length - start && end < right.length - start && left[left.length - end - 1] === right[right.length - end - 1]) end += 1;
  return {
    prefix: left.slice(0, start).join(''),
    before: left.slice(start, left.length - end).join(''),
    after: right.slice(start, right.length - end).join(''),
    suffix: end ? left.slice(-end).join('') : '',
  };
}

function Highlight({ before, after, side }: { before: string; after: string; side: 'before' | 'after' }) {
  const delta = splitPathChange(before, after);
  const changed = delta[side];
  return <>{delta.prefix}{changed && (side === 'before'
    ? <del className="rounded bg-red-50 px-0.5 text-red-800 decoration-red-400">{changed}</del>
    : <ins className="rounded bg-main-50 px-0.5 text-main-900 no-underline">{changed}</ins>)}{delta.suffix}</>;
}

function parts(value: string) {
  const separator = value.lastIndexOf('/');
  return { directory: value.slice(0, separator < 0 ? 0 : separator), filename: value.slice(separator + 1) };
}

export function PathChange({ before, after }: { before: string; after: string }) {
  before = useSourcePath(before); after = useSourcePath(after);
  const old = parts(before); const next = parts(after);
  const moved = old.directory !== next.directory;
  const renamed = old.filename !== next.filename;
  const kind = moved && renamed ? 'Moved and renamed' : moved ? 'Moved' : renamed ? 'Renamed' : 'Unchanged';
  return <span role="group" aria-label={`${kind}: ${before} → ${after}`} title={`${before} → ${after}`} className="block min-w-0" data-testid="source-path-change">
    <span aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {(['before', 'after'] as const).map(side => {
        const value = side === 'before' ? old : next;
        return <span key={side} className="contents">
          {side === 'after' && <span className="text-amber-500">→</span>}
          <span data-testid={`source-path-${side}`} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
            <span className="text-neutral-500"><Highlight before={old.directory} after={next.directory} side={side} />{value.directory && <span className="mx-1 text-neutral-400">/</span>}</span><span className="font-medium text-neutral-700"><Highlight before={old.filename} after={next.filename} side={side} /></span>
          </span>
        </span>;
      })}
    </span>
  </span>;
}
