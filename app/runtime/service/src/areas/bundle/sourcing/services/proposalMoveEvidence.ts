/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { sha256, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { findSourceMoves } from './sourceReview.js';

// Retain only small result lists, not source text or full graph objects.
const evidence = new Map<string, SourceMoveCandidate[]>();
const maximumContexts = 8;

/** Identity choices reuse evidence; changes to captures, routes, or configured identities invalidate it. */
export function proposalMoveEvidence(directory: string, previous: SourceSnapshot, current: SourceSnapshot, identities: BundleNodeConfig[]) {
  const key = `${directory}\0${sha256(JSON.stringify([previous, current, identities]))}`;
  let moves = evidence.get(key);
  if (!moves) moves = findSourceMoves(directory, previous, current, identities);
  evidence.delete(key);
  evidence.set(key, moves);
  if (evidence.size > maximumContexts) evidence.delete(evidence.keys().next().value!);
  // Callers can annotate and sort results without changing another review's evidence.
  return globalThis.structuredClone(moves);
}
