/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Rename a page without updating the link that reached its old name. Meadow should not
 * transfer the old identity to the now-unreachable page.
 */
test('Sourcing does not assign identity to a renamed page whose old link is unchanged', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't003 ---- page with section to link to' });
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Rename the page without updating its links.
  await sourceChanges.apply('rename-page-without-links');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectNoRenames();
  await editor.sourceReview.orphans.expectOrphanListed(original.bundleNodeName);
  await editor.sourceReview.orphans.showExplanation(original.bundleNodeName);
  await editor.sourceReview.orphans.expectExplanation(original.bundleNodeName, 'but that file does not exist in the filesystem.');
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
