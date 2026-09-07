/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Shared indeterminate progress indicator, including HTML generation and source updates. */
export function Spinner() {
  return <span aria-hidden="true" className="animate-spin h-4 w-4 shrink-0 border-2 border-neutral-300 border-t-main-500 rounded-full inline-block" />;
}
