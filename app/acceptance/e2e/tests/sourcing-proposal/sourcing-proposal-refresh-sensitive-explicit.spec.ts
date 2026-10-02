/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewSensitivity, sensitive, filterSensitivity, tracking, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Explicitly track a proposed page, then change its source so it matches a sensitivity filter and
 * update the proposal. Verify the tracking decision is flagged and blocks acceptance until explicitly
 * confirmed or untracked. Exercise both choices against the reviewed capture. Required restorable
 * checkpoint: the renewed sensitivity review open and unresolved.
 */
test.fixme("Refreshing source material requires renewed confirmation for explicit tracking that becomes sensitive", async () => {});
