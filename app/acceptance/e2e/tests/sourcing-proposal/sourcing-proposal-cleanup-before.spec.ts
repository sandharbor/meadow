/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewCleanup, pendingSourceProposal, blacklist, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Reduce depth and blacklist a reachable subtree in a proposal. Verify excluded node configuration is
 * retained across Later and restart. Reverse each edit before acceptance and verify tracking and
 * presentation decisions return immediately. Required checkpoints: excluded configured pages; reopened
 * pending exclusion; restored configuration.
 */
test.fixme("Reversing pending scope exclusions restores saved page configuration before acceptance", async () => {});
