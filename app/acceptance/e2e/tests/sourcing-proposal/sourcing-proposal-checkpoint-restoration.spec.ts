/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, checkpointViewRestoration, sourceReviewViewState, checkpoint, appPlace, savedState } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

test.use({ executionSurfaces: ['dev-tools', 'browser'] });

/*
 * Planned scenario, not executable evidence.
 * Capture separate mode states and a tabbed modal at a specific active tab, including filters,
 * highlight/Fade, selection, labels, and pan/zoom. Open the checkpoint in a fresh Dev Tools fork and
 * verify both mode states and the exact App Place, dialog, and tab restore. Repeat for the unresolved
 * conflict and sensitivity reviews so manual resolution is immediately possible. Required checkpoints:
 * captured dialog/tab; restored development fork.
 */
test.fixme("Fresh Dev Tools forks restore both mode views and exact modal tabs from checkpoints", async () => {});
