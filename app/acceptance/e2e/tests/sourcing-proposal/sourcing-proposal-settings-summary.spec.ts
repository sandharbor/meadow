/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, proposalConfigurationDraft, sourceReviewWorkspace, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Stage traversal, filter, tracking, and global-policy edits while ordinary source changes are
 * visible. Verify compact counts in the persistent sourcing header and expandable before/after
 * entries, including global scope. Verify unchanged untracked nodes are discoverable through the
 * existing Untracked filter and ordinary acceptance applies the complete proposal. Required
 * checkpoints: compact summary; expanded settings review.
 */
test.fixme("Sourcing summarizes staged settings and tracking edits without adding a graph change category", async () => {});
