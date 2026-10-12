/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../../../../../contracts/types/shared/sourcing/sourcing.js';
import type { SourceIdentityRecommendation } from '../../../../../../../contracts/types/areas/bundle/sourcing/sourceIdentity.js';

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
