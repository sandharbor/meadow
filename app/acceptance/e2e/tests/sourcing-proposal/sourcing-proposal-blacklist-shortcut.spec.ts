/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Exercise a page leaf and an empty folder with no wider admission effects. Verify curation applies
 * blacklist or unblacklist directly with Undo. Exercise an apparent leaf with a hidden wider
 * consequence and verify sourcing is required. While already sourcing, even the harmless edit remains
 * staged. Required checkpoints: direct edit with Undo; staged harmless edit.
 */
test.fixme("Curation applies blacklist shortcuts only when calculated impact is limited to the selected item", async () => {});
