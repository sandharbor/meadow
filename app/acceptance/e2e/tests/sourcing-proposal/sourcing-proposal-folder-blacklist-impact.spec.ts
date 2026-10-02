/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Blacklist a folder whose traversal reaches pages outside its subtree. Verify the full impact enters
 * sourcing rather than relying only on visible descendants. Accept the boundary, then unblacklist and
 * review returning material through the same trigger rule. Required checkpoints: outside-subtree
 * departures; proposed expansion.
 */
test.fixme("Sourcing previews folder blacklist and unblacklist reachability consequences", async () => {});
