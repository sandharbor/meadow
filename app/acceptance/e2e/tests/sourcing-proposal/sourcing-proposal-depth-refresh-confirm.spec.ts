/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewTrigger, pendingProposalRevalidation, sourceChangesDuringReview, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Review a candidate, change its live links and destinations, and request greater depth. Confirm
 * Update proposal and change depth. Verify a coherent latest capture under proposed depth, with no
 * hybrid old-link/new-destination graph, preserving applicable decisions and surfacing new identity or
 * policy conflicts. Required checkpoints: confirmation open; rebuilt proposal.
 */
test.fixme("Confirming a depth change incorporates newer sources and applies the edit together", async () => {});
