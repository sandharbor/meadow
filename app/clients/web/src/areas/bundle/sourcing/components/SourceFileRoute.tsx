/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export function FilePill({ path }: { path: string }) {
  return <span title={path} data-testid="source-file-pill" className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 align-middle text-neutral-700">
    <span aria-hidden="true" className="shrink-0 text-neutral-400">▤</span><span className="[overflow-wrap:anywhere]">{path.split('/').pop()}</span>
  </span>;
}

export function FileRoute({ paths }: { paths: string[] }) {
  return <div className="mt-2 flex flex-wrap items-center gap-1">{paths.map((path, index) => <span key={`${index}:${path}`} className="contents">{index > 0 && <span aria-hidden="true">→</span>}<FilePill path={path} /></span>)}</div>;
}
