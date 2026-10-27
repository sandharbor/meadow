/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceSensitivityChange } from '../../../concepts/index.js';

export const sourceSensitivityChangeDefinition = {
  id: 'source-sensitivity-change', parent: 'modify', filterId: 'modified-sensitivity', label: 'Sensitivity changed',
  description: 'A tracked node is now sensitive and its inclusion can be reviewed.',
  matches: review => Boolean(review.modification?.sensitivity),
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceSensitivityChange['id'] };

export type SourceSensitivityChangeMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceSensitivityChange, 'classify-subtype', typeof sourceSensitivityChangeDefinition>,
];
