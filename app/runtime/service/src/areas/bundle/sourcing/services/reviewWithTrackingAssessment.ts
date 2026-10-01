/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { sourcingQuerySnapshotSensitivity } from '../../curation/exported.js';
import { scanSourceChanges, sourcingReview } from './sourceReview.js';

async function withTrackingAssessment(directory: string, review: SourcingReview): Promise<SourcingReview> {
  const added = review.changes.filter(change => change.kind === 'added').map(change => serializeBundleNodeKey(fileNodeKeyFromSourceFilePath(change.path)));
  const sensitivity = await sourcingQuerySnapshotSensitivity(directory, review.candidate?.id ?? review.accepted.id, added);
  return { ...review, trackingSensitivity: Object.fromEntries(review.changes.filter(change => change.kind === 'added').flatMap(change => {
    const assessment = sensitivity[serializeBundleNodeKey(fileNodeKeyFromSourceFilePath(change.path))];
    return assessment ? [[change.path, assessment]] : [];
  })) };
}

export async function reviewWithTrackingAssessment(directory: string): Promise<SourcingReview> {
  return withTrackingAssessment(directory, await sourcingReview(directory));
}

export async function scanWithTrackingAssessment(directory: string, replaceCandidate: boolean, rebuildIndex: boolean): Promise<SourcingReview> {
  return withTrackingAssessment(directory, await scanSourceChanges(directory, replaceCandidate, rebuildIndex));
}

import { serializeBundleNodeKey, fileNodeKeyFromSourceFilePath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
