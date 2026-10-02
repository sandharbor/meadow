/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewTrigger, frontier, sourceSnapshot } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Enter sourcing for frontier exploration with no pending external changes. Inspect boundary nodes and
 * adjust traversal to admit more material. Choose Later and verify curation and generation remain on
 * accepted material; accept the proposal and verify return to curation with frontier exploration
 * confined to sourcing. Required checkpoints: boundary exploration; deferred curation; accepted
 * expansion.
 */
test.fixme("Sourcing explores the frontier without changing accepted material until acceptance", async () => {});
