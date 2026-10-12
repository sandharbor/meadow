/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { GenerationRecordState } from './generatedOutputIdentity.js';

export type GeneratedComparisonEndpointKind = 'empty' | 'saved' | 'working';

export interface GeneratedComparisonEndpoint {
  kind: GeneratedComparisonEndpointKind;
  versionId: string | null;
  /** Resolved commit for a saved endpoint. */
  commit: string | null;
  /** Git tree of the generated files for a saved endpoint. */
  savedGenerationId: string | null;
  record: GenerationRecordState;
}
