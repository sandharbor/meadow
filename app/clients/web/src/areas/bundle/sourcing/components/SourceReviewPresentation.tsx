/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useSourcePath } from '../../../../shared/components/SourceNames.js';

const SOURCE_CHANGE_COUNT_THRESHOLD = 10;

export function SourceChangeCount({ count }: { count: number }) {
  return count >= SOURCE_CHANGE_COUNT_THRESHOLD ? <span className="font-normal text-neutral-500"> ({count})</span> : null;
}

export function SourcePath({ value }: { value: string }) {
  value = useSourcePath(value);
  const separator = value.lastIndexOf('/');
  return <span className="min-w-0 text-sm [overflow-wrap:anywhere]" title={value}>{separator >= 0 && <span className="text-neutral-500">{value.slice(0, separator)}<span className="mx-1 text-neutral-400">/</span></span>}<span className="font-medium text-neutral-700">{value.slice(separator + 1)}</span></span>;
}
