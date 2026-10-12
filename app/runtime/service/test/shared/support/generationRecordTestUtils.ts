/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { GeneratedOutputOwnership, GeneratedOutputRole } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputIdentity.js';
import type { GeneratedResultMetadata } from '../../../src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';

export const ownedOutput = (relativePath: string, bundleNodeId: string, role: GeneratedOutputRole = 'page'): GeneratedOutputOwnership => ({
  path: relativePath,
  bundleNodeId: bundleNodeId as BundleNodeId,
  role,
});

/** Generation metadata as a production generation reports it, for lifecycle tests. */
export function testGenerationMetadata(
  owners: GeneratedOutputOwnership[] = [],
  sourceSnapshotId = 'snapshot-test',
): GeneratedResultMetadata {
  return {
    captured: { sourceSnapshotId, bundleConfig: { bundleGuid: 'abc1234' }, nodeConfig: '', appConfig: {} },
    emitted: { owners, includedSources: [] },
  };
}
