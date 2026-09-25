/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Delete a captured leaf page and review why it is missing. Accepting the change should
 * remove its orphaned configuration.
 */
test('Sourcing reviews a deleted leaf as missing and removes its orphaned configuration on acceptance', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't001 ---- child 2' });
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Delete the nested page.
  await sourceChanges.apply('delete-nested-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectNoRenames();
  await editor.sourceReview.orphans.expectOrphanListed(original.bundleNodeName);
  await editor.sourceReview.orphans.showExplanation(original.bundleNodeName);
  await editor.sourceReview.orphans.expectExplanation(original.bundleNodeName, 'does not exist in the filesystem.');
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual(original);
  await addKeyFrame(orphan);
  await checkpoint('the missing page keeps its accepted configuration until review is accepted');

  // Accept the source update.
  await editor.sourceReview.accept();
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toBeUndefined();
  await editor.expectSourceOrphanCount(0);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('acceptance removes the orphaned configuration');

  await skipMeadowHomeStateCheck();
});
