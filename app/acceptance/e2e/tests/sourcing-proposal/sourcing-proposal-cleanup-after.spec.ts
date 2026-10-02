/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewCleanup, sourceReviewAcceptance, orphan, blacklist, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Combine an intentional boundary exclusion with an external removed link. Accept and verify mandatory
 * cleanup of unreachable page configuration with no Keep in config exception, retaining the causal
 * boundary controls and external source files. Expand after acceptance and verify returning pages have
 * fresh curation decisions. Required checkpoints: both disappearance causes; cleaned accepted graph;
 * fresh re-expansion.
 */
test.fixme("Acceptance cleans unreachable configuration for both scope exclusions and external orphans", async () => {});
