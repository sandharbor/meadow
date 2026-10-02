/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewSensitivity, sensitive, filterSensitivity, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Automatically provisionally track a safe addition, change its source to become filter-sensitive, and
 * update the proposal. Verify automatic tracking becomes untracked without an explicit-choice
 * confirmation. Accept the material and verify the page remains untracked in curation. Required
 * checkpoints: safe automatic choice; refreshed sensitive addition; accepted untracked page.
 */
test.fixme("Refreshing source material makes newly sensitive automatic tracking choices untracked", async () => {});
