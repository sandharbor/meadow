/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, sourceReviewIdentity, sourceMove, bundleNodeId } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Planned scenario, not executable evidence.
 * Review a large rename batch containing unambiguous suggestions and competing identities. Confirm the
 * unambiguous group using the count-labeled bulk action; inspect matching evidence and resolve
 * ambiguous cases individually. Continue to graph without accepting sources. Verify confirmed identity
 * is one node with old and new locations; rejected matches remain separate. Required checkpoints: bulk
 * identity review; resolved comparison graph.
 */
test.fixme("Sourcing bulk-confirms unambiguous rename suggestions while ambiguous matches require choices", async () => {});
