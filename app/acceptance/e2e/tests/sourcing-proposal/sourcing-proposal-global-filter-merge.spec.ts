/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, proposalConfigurationDraft, pendingProposalRevalidation, sourceReviewConfigurationMerge, filters, filterSensitivity } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Edit global filter definitions in sourcing and verify the all-bundles, both-modes,
 * pending-acceptance callout. Another curation context edits a different filter and then the same
 * filter. Verify independent changes survive, conflicting values require a choice, and acceptance
 * never replaces an entire saved filter file. Cover creation, deletion, enablement, and related
 * persistent default-filter metadata. Required checkpoints: global draft isolated; global conflict
 * open; merged acceptance.
 */
test.fixme("Sourcing global filter drafts preserve unrelated edits and resolve competing shared changes", async () => {});
