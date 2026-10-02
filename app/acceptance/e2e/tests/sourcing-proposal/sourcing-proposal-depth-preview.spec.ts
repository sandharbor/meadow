/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewTrigger, sourceReviewWorkspace, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Increase a page's traversal depth from curation and enter sourcing. Inspect newly admitted nodes
 * immediately, the staged depth in the header summary, and the unchanged accepted settings. Choose
 * Later, reload, and verify accepted curation still uses the old scope and reopening restores the
 * proposed depth. Required checkpoints: accepted baseline; expanded candidate; reopened deferred
 * proposal.
 */
test.fixme("Sourcing depth edits preview the proposal while accepted curation stays stable", async () => {});
