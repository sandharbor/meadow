/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Blacklist a page that supplies the only route to other pages, including one outside its folder.
 * Verify the wider departures enter sourcing and remain inspectable with their prior connections.
 * Preserve pages reached by independent routes. Reverse the draft blacklist and verify the affected
 * configuration is restored. Required checkpoints: wider departures; reversed exclusion.
 */
test.fixme("Sourcing previews page blacklist effects beyond the selected page", async () => {});
