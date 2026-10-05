/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, orphan, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Delete a captured leaf page and review why it is missing. Accepting the change should
 * remove its orphaned configuration.
 */
test('Sourcing reviews a deleted leaf as missing and removes its orphaned configuration on acceptance', { annotation: { type: 'scenario-id', description: '4561dd3b-dd74-49b1-9aed-37e33efabe7d' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't001 ---- child 2' });
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Delete the nested page.
  await sourceCommand(() => sourceChanges.apply('delete-nested-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectNoRenames());
  await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed(original.bundleNodeName));
  await sourceCommand(() => editor.sourceReview.orphans.showExplanation(original.bundleNodeName));
  await sourceCommand(() => editor.sourceReview.orphans.expectExplanation(original.bundleNodeName, 'does not exist in the filesystem.'));
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual(original);
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => checkpoint('the missing page keeps its accepted configuration until review is accepted'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toBeUndefined();
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('acceptance removes the orphaned configuration'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
