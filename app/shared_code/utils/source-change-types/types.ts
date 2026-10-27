/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceNodeReview } from '../../../contracts/types/shared/sourcing/sourcingProposal.js';

export interface SourceChangeSubtype {
  readonly id: string;
  readonly parent: 'modify' | 'remove';
  readonly filterId: string;
  readonly label: string;
  readonly description: string;
  readonly matches: (review: SourceNodeReview) => boolean;
}
