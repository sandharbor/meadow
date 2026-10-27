/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceUnreachableRemoval } from '../../../concepts/index.js';

export const sourceUnreachableRemovalDefinition = {
  id: 'source-removal-unreachable', parent: 'remove', filterId: 'unreachable', label: 'Not reachable',
  description: 'An upstream change breaks the route to this page: a blacklisted page, a removed link, a missing source, or traversal settings.',
  matches: review => review.kind === 'departing' && review.removalReason === 'unreachable',
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceUnreachableRemoval['id'] };

export type SourceUnreachableRemovalMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceUnreachableRemoval, 'classify-subtype', typeof sourceUnreachableRemovalDefinition>,
];
