/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test } from '../../src/run/test-fixtures.js';
import { sourcingReviewRedesign, conceptImplementationNavigation, conceptRoleValidation, sourceSnapshot } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

test.use({ executionSurfaces: ['dev-tools', 'browser'] });

/*
 * Planned scenario, not executable evidence.
 * Open an existing implemented concept in the report viewer, inspect its derived
 * role/symbol/file/location links, and follow them to real production participants. Verify proposed
 * concepts do not invent participants. Exercise reverse navigation and source links without duplicate
 * manual mappings; checker negative cases are separate module tests. Required checkpoints:
 * implemented-by listing; selected implementation location.
 */
test.fixme("Concept pages derive implemented-by navigation from exact inline participation identities", async () => {});
