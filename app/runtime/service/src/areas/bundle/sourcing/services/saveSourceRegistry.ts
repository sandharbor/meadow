/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import type { StartingSelection } from '../../../../../../../contracts/types/startingSelection.js';
import path from 'node:path';
import { runSerializedBundleNodeMutation } from '../../../../shared/bundle-node/bundleNodeMutationQueue.js';
import { withSourcingLock } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { stageSourceRegistry } from './sourceRegistryReview.js';
import { acceptSourceSnapshot, sourcingReview } from './sourceReview.js';

/** Saving settings can install unchanged material; different material still needs review. */
export async function saveSourceRegistry(directory: string, sources: BundleSource[], selections?: StartingSelection[]): Promise<void> {
  // Keep discovery, the material comparison, and installation in one operation so
  // another scan cannot replace the compared candidate before it is installed.
  await runSerializedBundleNodeMutation(path.basename(directory), () => withSourcingLock(directory, async () => {
    await stageSourceRegistry(directory, sources, selections);
    const review = await sourcingReview(directory);
    if (!review.candidate || review.changes.length || review.moves.length || review.orphans.length) return;
    await acceptSourceSnapshot(directory, {
      candidateId: review.candidate.id, reviewToken: review.reviewToken, resolutions: {},
      trackNewPages: review.trackNewPages,
    });
  }));
}
