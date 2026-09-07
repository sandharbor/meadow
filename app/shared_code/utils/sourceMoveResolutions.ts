/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../contracts/types/sourcing.js';

/** Matches arrive in confidence order within each node; explicit corrections take precedence. */
export function proposedSourceMoveResolutions(moves: SourceMoveCandidate[], overrides: Record<string, string | null> = {}): Record<string, string | null> {
  const result: Record<string, string | null> = { ...overrides };
  const used = new Set(Object.values(overrides).filter((value): value is string => value !== null));
  const ids = new Set(moves.map(move => move.bundleNodeId));
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(result, id)) continue;
    const proposed = moves.find(move => move.bundleNodeId === id && !used.has(move.newPath));
    result[id] = proposed?.newPath ?? null;
    if (proposed) used.add(proposed.newPath);
  }
  return result;
}
