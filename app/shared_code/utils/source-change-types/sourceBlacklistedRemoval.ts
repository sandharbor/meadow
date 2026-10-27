/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceBlacklistedRemoval } from '../../../concepts/index.js';

export const sourceBlacklistedRemovalDefinition = {
  id: 'source-removal-blacklisted', parent: 'remove', filterId: 'blacklisted', label: 'Blacklisted',
  description: 'This page is blacklisted in the proposed configuration.',
  matches: review => review.kind === 'departing' && review.removalReason === 'blacklisted',
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceBlacklistedRemoval['id'] };

export type SourceBlacklistedRemovalMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceBlacklistedRemoval, 'classify-subtype', typeof sourceBlacklistedRemovalDefinition>,
];
