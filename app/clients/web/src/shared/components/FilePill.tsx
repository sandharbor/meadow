/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useSourcePath } from './SourceNames.js';

export function FilePill({ path }: { path: string }) {
  const label = useSourcePath(path);
  const qualified = label !== path;
  return <span title={label} data-testid="source-file-pill" className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 align-middle text-neutral-700">
    <span aria-hidden="true" className="shrink-0 text-neutral-400">▤</span><span className="[overflow-wrap:anywhere]">{qualified ? label : path.split('/').pop()}</span>
  </span>;
}
