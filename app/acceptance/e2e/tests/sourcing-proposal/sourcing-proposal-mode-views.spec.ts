/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewViewState, sourceReviewWorkspace, sourceReviewAcceptance } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Set distinct filter mixes, group expansions, hidden and solo sets, labels, selection, graph/list
 * mode, and pan/zoom in curation and sourcing. Verify first sourcing entry does not inherit a curation
 * solo that hides additions. Switch via Later, reopen, and accept; verify each mode resumes its own
 * view and acceptance returns to curation. Required checkpoints: each mode's view; returned curation.
 */
test.fixme("Sourcing and curation restore independent graph and list view state on transitions", async () => {});
