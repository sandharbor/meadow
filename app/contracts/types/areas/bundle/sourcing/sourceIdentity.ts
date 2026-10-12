/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../shared/sourcing/sourcing.js';

export interface SourceIdentityRecommendation {
  id: string;
  moves: SourceMoveCandidate[];
  confident: boolean;
  /** Undefined leaves the decision to the user; null recommends separate pages. */
  destination?: string | null;
  decided: boolean;
}
