/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingSourceProposal, proposalConfigurationDraft, sourceReviewConfigurationMerge } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Stage node settings, tracking, a bundle filter, and a global filter. Choose Later and restart;
 * verify the same draft is restored while accepted curation and other bundles retain their saved
 * policy. Discard the proposal and verify only its drafts disappear, preserving unrelated accepted
 * edits and external source-file changes. Required checkpoints: accumulated drafts; deferred
 * restoration; post-discard curation.
 */
test.fixme("Sourcing preserves node and filter drafts on Later and discards them together", async () => {});
