/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewSensitivity, tracking, sensitive, filterSensitivity } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Review safe, directly sensitive, and filter-sensitive additions under the saved tracking preference.
 * Verify provisional effects, individual opt-outs, and preference-off behavior. Accept all source
 * material while leaving selected pages untracked, verify curation's Untracked filter, and verify the
 * existing preview warning. Required checkpoints: provisional choices; accepted untracked additions.
 */
test.fixme("Sourcing shows provisional tracking preferences and permits untracked accepted additions", async () => {});
