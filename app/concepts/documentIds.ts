/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { CoreConceptId } from './ids.js';

export const designPressureIds = { preventAccidentalSharing: 'prevent-accidental-sharing' } as const;
export type CoreDocumentId = CoreConceptId | typeof designPressureIds[keyof typeof designPressureIds];
