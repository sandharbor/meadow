/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from '../../../shared/bundle-graph/bundleNodeConfig.js';
import type { GeneratedOutputRole } from '../../../shared/generated-bundle-versioning/generatedOutputIdentity.js';
import type { GeneratedComparisonEndpoint } from '../../../shared/generated-bundle-versioning/generatedOutputComparison.js';

export interface GeneratedFileReference {
  path: string;
  /** Git blob ID of the referenced bytes. */
  objectId: string;
}

/** One logical generated-file change. Moves and modifications are independent facts. */
export interface GeneratedChangeEntry {
  /** Selection and indexing key. A deletion and an addition can share a path. */
  entryId: string;
  kind: 'added' | 'deleted' | 'changed';
  moved: boolean;
  modified: boolean;
  before: GeneratedFileReference | null;
  after: GeneratedFileReference | null;
  owner: { bundleNodeId: BundleNodeId; role: GeneratedOutputRole } | null;
}

export type GeneratedComparisonBaseline =
  | 'empty'
  | 'saved-current'
  | 'saved-predecessor'
  | 'selected';

export interface GeneratedOutputComparison {
  left: GeneratedComparisonEndpoint;
  right: GeneratedComparisonEndpoint;
  baseline: GeneratedComparisonBaseline;
  /** True when both endpoints supplied valid identity and moves could be paired. */
  identityPairing: boolean;
  entries: GeneratedChangeEntry[];
}
