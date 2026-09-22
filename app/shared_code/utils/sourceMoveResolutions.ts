/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../contracts/types/sourcing.js';

/** Uncontested matches can be proposed; competing identities always require an explicit choice. */
export function proposedSourceMoveResolutions(moves: SourceMoveCandidate[], overrides: Record<string, string | null> = {}): Partial<Record<string, string | null>> {
  const result: Partial<Record<string, string | null>> = { ...overrides };
  const used = new Set(Object.values(overrides).filter((value): value is string => value !== null));
  const ids = new Set(moves.map(move => move.bundleNodeId));
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(result, id)) continue;
    if (moves.some(move => move.bundleNodeId === id && move.competing)) continue;
    const proposed = moves.find(move => move.bundleNodeId === id && !used.has(move.newPath));
    result[id] = proposed?.newPath ?? null;
    if (proposed) used.add(proposed.newPath);
  }
  return result;
}
