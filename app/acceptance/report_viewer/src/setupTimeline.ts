/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** Locate Section 1 using captured execution, with checkpoint timing for older runs. */
export function setupTimelineBoundary({ setupEndLine, firstTestLine, ticks, sourceCheckpoints, checkpoints }: {
  setupEndLine?: number;
  firstTestLine?: number;
  ticks: readonly { timestamp: string; sourceCommand?: { line: number } }[];
  sourceCheckpoints: readonly { line: number; message: string }[];
  checkpoints: readonly { timestamp: string; message: string }[];
}): number | null {
  if (setupEndLine === undefined) return null;
  if (firstTestLine === undefined) return Infinity;
  const firstTestTick = ticks.find(tick => tick.sourceCommand && tick.sourceCommand.line >= firstTestLine);
  if (firstTestTick) {
    const time = Date.parse(firstTestTick.timestamp);
    return Number.isFinite(time) ? time : null;
  }
  // A recording that never left setup has no full-opacity test segment.
  if (ticks.some(tick => tick.sourceCommand)) return Infinity;
  let index = sourceCheckpoints.length - 1;
  while (index >= 0 && sourceCheckpoints[index].line > setupEndLine) index--;
  const checkpoint = checkpoints[index];
  if (!checkpoint || checkpoint.message !== sourceCheckpoints[index]?.message) return null;
  const time = Date.parse(checkpoint.timestamp);
  return Number.isFinite(time) ? time : null;
}
