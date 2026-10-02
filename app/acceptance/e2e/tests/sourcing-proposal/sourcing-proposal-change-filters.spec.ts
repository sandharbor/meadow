/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewFiltering, sourceReviewAcceptance, orphan, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Inspect Added, Modified, No longer included, Renames and moves, Orphaned configuration, and
 * Unchanged. Expand departure causes and verify missing-source versus lost-reachability explanations
 * without double-counting orphans. Combine category and folder filters, hide or solo groups, and
 * verify proposal decisions and eventual acceptance are unchanged. Hover and selection expose routes
 * and content diffs. Required checkpoints: grouped causes; filtered comparison; full acceptance.
 */
test.fixme("Source-change filters alter only presentation and expose removal reasons and evidence", async () => {});
