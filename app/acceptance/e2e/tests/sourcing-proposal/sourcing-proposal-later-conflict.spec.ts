/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, pendingSourceProposal, pendingProposalRevalidation, sourceReviewConfigurationMerge, proposalConfigurationDraft, tracking, blacklist, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Stage untracking a leaf page in sourcing, choose Later, blacklist that same page in curation using
 * the selected-item-only shortcut, and track an unrelated page. Reload and reopen sourcing.
 * Verify the conflict is visible and acceptance is
 * blocked. Exercise both resolution outcomes and verify the chosen result and unrelated tracking
 * survive acceptance. Required restorable checkpoints: pending untrack; later curation edits;
 * conflict-resolution modal open and unresolved; resolved acceptance.
 */
test.fixme("Pending sourcing proposals preserve later curation decisions and require conflict resolution", async () => {});
