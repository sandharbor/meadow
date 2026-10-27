/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceMissingRemoval } from '../../../concepts/index.js';

export const sourceMissingRemovalDefinition = {
  id: 'source-removal-missing', parent: 'remove', filterId: 'missing', label: 'Source missing',
  description: 'Missing on disk when the proposed capture was made.',
  matches: review => review.kind === 'departing' && review.removalReason === 'source-missing',
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceMissingRemoval['id'] };

export type SourceMissingRemovalMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceMissingRemoval, 'classify-subtype', typeof sourceMissingRemovalDefinition>,
];
