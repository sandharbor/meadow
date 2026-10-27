/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceContentChange } from '../../../concepts/index.js';

export const sourceContentChangeDefinition = {
  id: 'source-content-change', parent: 'modify', filterId: 'modified-source', label: 'Source change',
  description: 'The captured file content differs from the accepted capture.',
  matches: review => review.kind === 'modified' && Boolean(review.modification?.source),
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceContentChange['id'] };

export type SourceContentChangeMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceContentChange, 'classify-subtype', typeof sourceContentChangeDefinition>,
];
