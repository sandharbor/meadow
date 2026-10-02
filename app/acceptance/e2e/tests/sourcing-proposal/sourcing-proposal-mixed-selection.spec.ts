/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, tracking, sourceReviewCleanup } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Select eligible candidate pages together with departing comparison-only nodes. Track selected and
 * verify only eligible pages receive staged tracking while skipped departures are explicitly
 * identified. Verify acceptance applies the complete source proposal rather than requiring per-node
 * source approval. Required checkpoints: mixed selection; visible bulk-action result.
 */
test.fixme("Sourcing bulk tracking explicitly reports departing comparison nodes it cannot track", async () => {});
