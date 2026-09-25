/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// E2E names its Local Services holder and partitions by run, so concurrent
// runs (for example in two worktrees) never share a bucket or table prefix.

function runId(): string {
  return process.env.E2E_RUN_ID || "default";
}

export function e2eLocalServicesHolder(): string {
  return `e2e-run-${runId()}`;
}

export function e2eWorkerPartition(parallelIndex: number): string {
  return `e2e-${runId()}-w${parallelIndex}`;
}
