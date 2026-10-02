/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewViewState } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Exercise equivalent graph/list selection, folder filtering, solo, hiding, labels, and node details
 * in both modes through their area-owned entry points. Verify mode-specific data and actions stay
 * correct and no reduced side graph replaces the full workspace. Structural import restrictions are
 * covered by the boundary checker's own negative tests, not by this UI scenario. Required checkpoints:
 * curation tools; sourcing tools.
 */
test.fixme("Sourcing and curation share full editor behavior while retaining mode-specific ownership", async () => {});
