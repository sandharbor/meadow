/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceDisconnectedRemoval } from '../../../concepts/index.js';

export const sourceDisconnectedRemovalDefinition = {
  id: 'source-removal-disconnected', parent: 'remove', filterId: 'disconnected', label: 'Disconnected',
  description: 'Its source was removed from the proposed registry. Its files are untouched.',
  matches: review => review.kind === 'departing' && review.removalReason === 'source-disconnected',
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceDisconnectedRemoval['id'] };

export type SourceDisconnectedRemovalMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceDisconnectedRemoval, 'classify-subtype', typeof sourceDisconnectedRemovalDefinition>,
];
