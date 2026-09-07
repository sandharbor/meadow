/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

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

function Difference({ before, after }: { before: string; after: string }) {
  const delta = splitPathChange(before, after);
  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm [overflow-wrap:anywhere]">
    <span><span className="text-neutral-500">{delta.prefix}</span><del className="rounded bg-red-50 px-0.5 text-red-800 decoration-red-400">{delta.before}</del><span className="text-neutral-500">{delta.suffix}</span></span>
    <span className="text-neutral-400">→</span>
    <span><span className="text-neutral-500">{delta.prefix}</span><ins className="rounded bg-main-50 px-0.5 font-medium text-main-900 no-underline">{delta.after}</ins><span className="text-neutral-500">{delta.suffix}</span></span>
  </div>;
}

function parts(value: string) {
  const separator = value.lastIndexOf('/');
  return { directory: value.slice(0, separator < 0 ? 0 : separator), filename: value.slice(separator + 1) };
}

export function PathChange({ before, after }: { before: string; after: string }) {
  const old = parts(before); const next = parts(after);
  const moved = old.directory !== next.directory;
  const renamed = old.filename !== next.filename;
  const kind = moved && renamed ? 'Moved and renamed' : moved ? 'Moved' : renamed ? 'Renamed' : 'Unchanged';
  return <div role="group" aria-label={`${kind}: ${before} → ${after}`} title={`${before} → ${after}`} className="min-w-0 space-y-1.5" data-testid="source-path-change">
    <div aria-hidden="true" className="space-y-1.5">
      <span className="text-xs font-medium text-main-700">{kind}</span>
      {renamed ? <Difference before={old.filename} after={next.filename} /> : <div className="text-sm font-medium [overflow-wrap:anywhere]">{next.filename}</div>}
      {moved ? <Difference before={old.directory || '(root)'} after={next.directory || '(root)'} />
        : old.directory && <div className="truncate text-xs text-neutral-500" title={old.directory}>{old.directory}/</div>}
    </div>
  </div>;
}
