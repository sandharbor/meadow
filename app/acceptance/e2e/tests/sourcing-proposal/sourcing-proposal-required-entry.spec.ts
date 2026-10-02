/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewCleanup, sourceReviewAcceptance, startingSelection, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Make a required root, traversal entry, or selected collection unavailable in the proposal. Verify
 * acceptance is blocked and does not silently remove required configuration or misclassify a
 * disconnected source as deletion. Repair identity or source registration and accept the valid
 * proposal. Required checkpoints: blocked required-entry review; repaired proposal.
 */
test.fixme("Sourcing requires repair of missing required entries before acceptance", async () => {});
