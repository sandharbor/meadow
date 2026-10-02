/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingSourceProposal, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewAcceptance, sourceSnapshot } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Capture version B, inspect its text and assets, then change live files to version C during review.
 * Verify the new-change indicator does not replace the candidate or its diff. Accept B, including
 * tracking from B, and verify accepted and generated material uses B. A subsequent proposal exposes C.
 * Required checkpoints: B reviewed with C available; accepted B; subsequent C proposal.
 */
test.fixme("Sourcing accepts the exact reviewed capture while newer live sources remain available", async () => {});
