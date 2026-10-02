/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewSensitivity, sensitive, filterSensitivity, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Leave a safe automatically tracked addition pending, choose Later, enable a matching accepted
 * sensitivity filter, restart, and reopen. Verify automatic tracking becomes untracked and accepted
 * policy remains intact on acceptance. Required checkpoints: deferred safe choice; reopened sensitive
 * untracked choice.
 */
test.fixme("Deferred proposals untrack automatic choices when accepted sensitivity policy changes", async () => {});
