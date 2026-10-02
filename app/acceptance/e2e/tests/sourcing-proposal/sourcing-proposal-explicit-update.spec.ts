/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, pendingSourceProposal } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Stage decisions in a captured proposal, change live sources, and explicitly choose Update proposal.
 * Verify a coherent refreshed capture, preserved compatible choices, and visible conflicts or
 * no-longer-applicable targets. Inject a refresh failure and verify the prior proposal stays intact.
 * Required checkpoints: newer sources available; refreshed decision review; failed update with old
 * proposal preserved.
 */
test.fixme("Updating a sourcing proposal preserves applicable decisions and exposes invalidated decisions", async () => {});
