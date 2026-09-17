/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import type { SourceSnapshotAcceptance } from '../../../../../../../contracts/types/sourcing.js';
import { runSerializedBundleNodeMutation } from '../../../../shared/bundle-node/bundleNodeMutationQueue.js';
import { acceptSourceSnapshot } from './sourceReview.js';

/** Serialize changes to the shared bundle configuration before handing off to curation. */
export function acceptSnapshotCommand(directory: string, request: SourceSnapshotAcceptance) {
  return runSerializedBundleNodeMutation(path.basename(directory), () => acceptSourceSnapshot(directory, request));
}
