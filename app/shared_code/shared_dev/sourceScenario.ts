/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingReview } from '../../contracts/types/sourcing.js';
import { appPlacePath } from '../../contracts/places/index.js';

export type RunMeadowCommand = (args: string[]) => Promise<string>;

/** Shared by dev launches and E2E setup; all source state changes use Command. */
export async function acceptSourceBaseline(run: RunMeadowCommand, slug: string): Promise<void> {
  const review = JSON.parse(await run(['bundle', 'sources', 'refresh', slug])) as SourcingReview;
  if (!review.candidate && !review.orphans.some(orphan => !orphan.removalBlockedReason)) return;
  await run(['bundle', 'sources', 'accept', slug, '--snapshot', (review.candidate ?? review.accepted).id, '--review-token', review.reviewToken]);
}

/** The caller owns fixture reset and the client handoff. */
export async function prepareSourceScenario(run: RunMeadowCommand, slug: string, applyChange: () => Promise<unknown>, options: { sourceUnavailable?: boolean } = {}): Promise<string> {
  await acceptSourceBaseline(run, slug);
  await applyChange();
  // Disconnection and required-start repair deliberately cannot capture a candidate.
  // Open the accepted bundle so its source controls can repair the live setup.
  if (options.sourceUnavailable) return appPlacePath({ page: 'bundle', slug });
  await run(['bundle', 'sources', 'refresh', slug]);
  return appPlacePath({ page: 'bundle', slug, surface: { name: 'source-review', parameters: {} } });
}
