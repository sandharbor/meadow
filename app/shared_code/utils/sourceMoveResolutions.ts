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

export interface SourceIdentityRecommendation {
  id: string;
  moves: SourceMoveCandidate[];
  confident: boolean;
  /** Undefined leaves the decision to the user; null recommends separate pages. */
  destination?: string | null;
  decided: boolean;
}

/** Only sufficiently supported, uncontested identities receive a recommended default. */
export function sourceIdentityRecommendations(moves: SourceMoveCandidate[], choices: Record<string, string | null>): SourceIdentityRecommendation[] {
  const groups = new Map<string, SourceMoveCandidate[]>();
  for (const move of moves) groups.set(move.bundleNodeId, [...(groups.get(move.bundleNodeId) ?? []), move]);
  return [...groups].map(([id, candidates]) => {
    candidates.sort((a, b) => b.similarity.score - a.similarity.score || a.newPath.localeCompare(b.newPath));
    const best = candidates[0];
    const sharedDestination = moves.some(move => move.bundleNodeId !== id && move.newPath === best.newPath);
    const confident = candidates.length === 1 && !best.competing && !sharedDestination && best.similarity.score >= 0.65;
    const decided = choices[id] === null || candidates.some(move => move.newPath === choices[id]);
    return { id, moves: candidates, confident, ...(confident && { destination: best.newPath }), decided };
  });
}
