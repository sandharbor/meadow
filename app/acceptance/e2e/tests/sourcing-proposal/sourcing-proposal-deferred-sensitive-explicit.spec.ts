/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewSensitivity, sourceReviewConfigurationMerge, sensitive, filterSensitivity, tracking, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Stage explicit tracking, choose Later, enable a matching sensitivity filter in curation, reload, and
 * reopen the proposal. Verify it uses current policy with the same captured material and blocks
 * acceptance until tracking is reconfirmed or removed. Exercise both outcomes. Required restorable
 * checkpoint: unresolved sensitivity review after reopening. This is accepted-policy revalidation, not
 * a filesystem-change scenario.
 */
test.fixme("Deferred proposals revalidate explicit tracking after accepted sensitivity policy changes", async () => {});
