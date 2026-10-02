/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewIdentity, pendingProposalRevalidation, sourceReviewAcceptance, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Resolve a proposed move, enter the graph, then reopen Review identities and change the decision.
 * Verify the graph rebuilds and affected tracking or configuration choices are revalidated. Preserve
 * the changed choice across Later. After acceptance, verify historical evidence is inspectable but the
 * completed proposal cannot be reopened for editing. Required checkpoints: proposed identity; revised
 * decision; accepted history.
 */
test.fixme("Sourcing identity choices remain revisable only while the proposal is pending", async () => {});
