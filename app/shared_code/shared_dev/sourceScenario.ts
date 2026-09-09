/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingReview } from '../../contracts/types/sourcing.js';
import { bundleDestinationPath } from '../../contracts/types/appDestination.js';

export type RunMeadowCommand = (args: string[]) => Promise<string>;

/** Shared by dev launches and E2E setup; all source state changes use Command. */
export async function acceptSourceBaseline(run: RunMeadowCommand, slug: string): Promise<void> {
  const review = JSON.parse(await run(['bundle', 'sources', 'refresh', slug])) as SourcingReview;
  await run(['bundle', 'sources', 'accept', slug, '--snapshot', (review.candidate ?? review.accepted).id, '--review-token', review.reviewToken]);
}

/** The caller owns fixture reset and the client handoff. */
export async function prepareSourceScenario(run: RunMeadowCommand, slug: string, applyChange: () => Promise<unknown>): Promise<string> {
  await acceptSourceBaseline(run, slug);
  await applyChange();
  await run(['bundle', 'sources', 'refresh', slug]);
  return bundleDestinationPath({ page: 'source-review', slug });
}
