/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceNodeReview } from '../../../../../contracts/types/shared/sourcing/sourcingProposal.js';

import { sourceContentChangeDefinition, sourceSensitivityChangeDefinition, sourceConfigurationChangeDefinition, sourceMissingRemovalDefinition, sourceDisconnectedRemovalDefinition, sourceBlacklistedRemovalDefinition, sourceUnreachableRemovalDefinition } from '../../../../../shared_code/utils/sourceChangeSubtypes.js';

/**
 * Shared category labels and colors for source-change highlights and selected-page evidence.
 * Labels name what accepting the proposal would do, not what happened to the source.
 */
export const sourceReviewAppearance = {
  added: { label: 'Add', color: '#16a34a' },
  moved: { label: 'Move', color: '#0891b2' },
  renamed: { label: 'Rename', color: '#9333ea' },
  modified: { label: 'Modify', color: '#2563eb' },
  departing: { label: 'Remove', color: '#dc2626' },
  unchanged: { label: 'Unchanged', color: '#737373' },
  frontier: { label: 'Frontier', color: '#d97706' },
};

/** The removal explanation is identical in the filter tooltip and selected-page disclosure. */
export const sourceRemovalReasons = {
  'source-missing': sourceMissingRemovalDefinition,
  'source-disconnected': sourceDisconnectedRemovalDefinition,
  blacklisted: sourceBlacklistedRemovalDefinition,
  unreachable: sourceUnreachableRemovalDefinition,
};

/** Modification subtypes share their definitions with the scenario overview. */
export const sourceModificationKinds = {
  source: sourceContentChangeDefinition,
  sensitivity: sourceSensitivityChangeDefinition,
  config: sourceConfigurationChangeDefinition,
};

/** Move and Rename are independent facts about the captured source locator. */
export function sourceReviewCategories(review: SourceNodeReview): Array<keyof typeof sourceReviewAppearance> {
  if (review.kind !== 'moved') return [review.kind];
  const before = review.previousPath ?? '', after = review.proposedPath ?? '';
  const directory = (value: string) => value.slice(0, Math.max(0, value.lastIndexOf('/')));
  const filename = (value: string) => value.slice(value.lastIndexOf('/') + 1);
  return [...(directory(before) !== directory(after) ? ['moved' as const] : []),
    ...(filename(before) !== filename(after) ? ['renamed' as const] : [])];
}

/** Compact route and hover presentations retain both labels for a combined change. */
export function sourceReviewSummaryAppearance(review: SourceNodeReview) {
  const categories = sourceReviewCategories(review);
  return { color: sourceReviewAppearance[categories[0] ?? review.kind].color,
    label: categories.map(kind => sourceReviewAppearance[kind].label).join(' and ') };
}
