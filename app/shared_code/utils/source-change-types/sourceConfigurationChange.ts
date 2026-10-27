/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceChangeSubtype } from './types.js';
import type { ParticipatesIn, sourceConfigurationChange } from '../../../concepts/index.js';

export const sourceConfigurationChangeDefinition = {
  id: 'source-configuration-change', parent: 'modify', filterId: 'modified-config', label: 'Config change',
  description: 'This page’s saved settings differ, such as blacklisting or traversal depth. Tracking choices are listed separately.',
  matches: review => review.kind === 'modified' && Boolean(review.modification?.settings.length),
} as const satisfies SourceChangeSubtype & { readonly id: typeof sourceConfigurationChange['id'] };

export type SourceConfigurationChangeMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceConfigurationChange, 'classify-subtype', typeof sourceConfigurationChangeDefinition>,
];
