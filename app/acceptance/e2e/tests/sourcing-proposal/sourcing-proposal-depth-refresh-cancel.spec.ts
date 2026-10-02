/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewTrigger, pendingProposalRevalidation, sourceChangesDuringReview, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Review a candidate, change its live links and files, then attempt greater depth. Verify the
 * confirmation explains that rebuilding incorporates newer sources. Cancel and assert the candidate
 * identity, displayed bytes, depth, and staged decisions are exactly unchanged. Required restorable
 * checkpoint: the confirmation modal open before the choice.
 */
test.fixme("Cancelling a depth change that needs newer sources preserves the reviewed proposal", async () => {});
