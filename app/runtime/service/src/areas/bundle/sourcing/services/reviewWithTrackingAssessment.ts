/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { sourcingQuerySnapshotSensitivity } from '../../curation/exported.js';
import { scanSourceChanges, sourcingReview } from './sourceReview.js';

async function withTrackingAssessment(directory: string, review: SourcingReview): Promise<SourcingReview> {
  const added = review.changes.filter(change => change.kind === 'added').map(change => change.path);
  return { ...review, trackingSensitivity: await sourcingQuerySnapshotSensitivity(directory, review.candidate?.id ?? review.accepted.id, added) };
}

export async function reviewWithTrackingAssessment(directory: string): Promise<SourcingReview> {
  return withTrackingAssessment(directory, await sourcingReview(directory));
}

export async function scanWithTrackingAssessment(directory: string, replaceCandidate: boolean, rebuildIndex: boolean): Promise<SourcingReview> {
  return withTrackingAssessment(directory, await scanSourceChanges(directory, replaceCandidate, rebuildIndex));
}
