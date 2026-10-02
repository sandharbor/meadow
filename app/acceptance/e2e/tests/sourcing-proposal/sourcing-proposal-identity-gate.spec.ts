/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewIdentity, sourceMove, pendingSourceProposal, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Enter source review with potential moves and renames. Verify the required identity modal offers
 * preserve-identity and separate-file decisions and prevents sourcing-graph interaction while
 * unresolved. Make some choices, choose Later or close, and verify return to curation; reload and
 * resume the partial review. Required restorable checkpoint: identity modal open with partial
 * decisions.
 */
test.fixme("Sourcing requires identity decisions before graph entry and preserves partial review on Later", async () => {});
