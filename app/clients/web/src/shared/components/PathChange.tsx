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

/** Split a prepared path label, keeping a `name://` root delimiter with its directory. */
export function splitPathLabel(value: string) {
  const separator = value.lastIndexOf('/');
  const namedRoot = separator >= 2 && value.slice(separator - 2, separator + 1) === '://';
  return {
    directory: value.slice(0, namedRoot ? separator + 1 : Math.max(0, separator)),
    filename: value.slice(separator + 1),
    separator: separator < 0 || namedRoot ? '' : '/',
  };
}

const removedClass = 'rounded bg-red-50 px-0.5 text-red-800 decoration-red-400';
const addedClass = 'rounded bg-main-50 px-0.5 text-main-900 no-underline';

function Highlight({ before, after, side, directories = false }: { before: string; after: string; side: 'before' | 'after'; directories?: boolean }) {
  const delta = splitPathChange(before, after);
  const changed = delta[side];
  const fragments = directories ? changed.split(/(\/)/) : [changed];
  return <>{delta.prefix}{fragments.map((fragment, index) => !fragment ? null : directories && fragment === '/' ? fragment : side === 'before'
    ? <del key={index} className={removedClass}>{fragment}</del>
    : <ins key={index} className={addedClass}>{fragment}</ins>)}{delta.suffix}</>;
}

export interface PathChangeProps {
  /** Prepared label of the old path. */
  before: string;
  /** Prepared label of the new path. */
  after: string;
  compact?: boolean;
  /** Wording for a file directly in the root, such as "Source root" or "Site root". */
  rootLabel?: string;
  /** Prefix of the stable test IDs for this presentation. */
  testIdPrefix?: string;
}

/**
 * Presentation of one path becoming another. Callers prepare the labels (for
 * example, resolving registered source names) and choose the root wording.
 */
export function PathChange({ before, after, compact = false, rootLabel = 'Root', testIdPrefix = 'path' }: PathChangeProps) {
  const old = splitPathLabel(before); const next = splitPathLabel(after);
  const moved = old.directory !== next.directory;
  const renamed = old.filename !== next.filename;
  const showDirectory = !compact || moved || !renamed;
  const showFilename = !compact || renamed || !moved;
  const kind = moved && renamed ? 'Moved and renamed' : moved ? 'Moved' : renamed ? 'Renamed' : 'Unchanged';
  return <span role="group" aria-label={`${kind}: ${before} → ${after}`} title={`${before} → ${after}`} className="block min-w-0" data-testid={`${testIdPrefix}-change`}>
    <span aria-hidden="true" className={`flex flex-wrap items-baseline gap-y-1 ${compact ? 'gap-x-1' : 'gap-x-2 text-sm'}`}>
      {(['before', 'after'] as const).map(side => {
        const value = side === 'before' ? old : next;
        return <span key={side} className="contents">
          {side === 'after' && <span className="text-amber-500">→</span>}
          <span data-testid={`${testIdPrefix}-${side}`} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
            {showDirectory && <span className="text-neutral-500">{!showFilename && !value.directory ? rootLabel : <Highlight before={old.directory} after={next.directory} side={side} directories={compact && !showFilename} />}{showFilename && value.separator && <span className="mx-1 text-neutral-400">{value.separator}</span>}</span>}{showFilename && <span className="font-medium text-neutral-700"><Highlight before={old.filename} after={next.filename} side={side} /></span>}
          </span>
        </span>;
      })}
    </span>
  </span>;
}

/** A prepared path that exists on only one side, marked like the changed text in PathChange. */
export function PathPresence({ path, side, testIdPrefix = 'path' }: { path: string; side: 'before' | 'after'; testIdPrefix?: string }) {
  return <span role="group" aria-label={`${side === 'before' ? 'Remove' : 'Add'}: ${path}`} className="block min-w-0 text-sm [overflow-wrap:anywhere]" data-testid={`${testIdPrefix}-presence`}>
    {side === 'before' ? <del aria-hidden="true" className={removedClass}>{path}</del> : <ins aria-hidden="true" className={addedClass}>{path}</ins>}
  </span>;
}

export function DirectoryChange({ before, after, rootLabel = 'Root', testId = 'directory-change' }: { before: string; after: string; rootLabel?: string; testId?: string }) {
  return <span role="group" aria-label={`Changed directories: ${before || rootLabel} → ${after || rootLabel}`} className="inline-flex flex-wrap items-baseline gap-x-2 text-sm text-neutral-500" data-testid={testId}>
    <span>{before ? <Highlight before={before} after={after} side="before" directories /> : rootLabel}</span>
    <span aria-hidden="true" className="text-amber-500">→</span>
    <span>{after ? <Highlight before={before} after={after} side="after" directories /> : rootLabel}</span>
  </span>;
}
