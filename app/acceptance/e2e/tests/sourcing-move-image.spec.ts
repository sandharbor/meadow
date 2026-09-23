/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

/*
 * Move a tracked image and review the proposed match. Accepting it should preserve both
 * the image's identity and tracking state.
 */
test('Sourcing moves a tracked image while preserving its identity and tracking', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't024 ---- test image' });
  expect(original.listType).toBe('whitelist');
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Move the tracked image.
  await sourceChanges.apply('move-tracked-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  await editor.sourceReview.expectMove('Moved', 't024/t024 ---- test image.png', 't024/images/t024 ---- test image.png');
  await editor.sourceReview.expectMoveListed(original.bundleNodeId);
  await editor.sourceReview.orphans.expectNotListed(original.bundleNodeName);
  await addKeyFrame(sourceMove);
  await snapshot('review identifies the move through the shared source change');

  // Accept the source update.
  await editor.sourceReview.accept();
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual({ ...original, sourceGraphSubdirectory: 't024/images' });
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('t024/images/t024 ---- test image.png', true);
  await editor.expectListViewNodeVisible('t024/t024 ---- test image.png', false);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the moved file remains reachable with the same identity and tracking');

  await skipMeadowHomeStateCheck();
});
