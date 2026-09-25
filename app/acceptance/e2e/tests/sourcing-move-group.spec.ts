/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Move a nested group whose links use page names. Accept the move and verify that all
 * three page identities survive.
 */
test('Sourcing moves a nested group while unchanged name-only links retain all three identities', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.readNodes().filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Move the nested group.
  await sourceChanges.apply('move-nested-group');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(3);
  for (const node of original) {
    await editor.sourceReview.expectMoveListed(node.bundleNodeId);
    await editor.sourceReview.orphans.expectNotListed(node.bundleNodeName);
  }
  await addKeyFrame(sourceMove);
  await checkpoint('all three reachable pages are proposed as moves');

  // Accept the source update.
  await editor.sourceReview.accept();
  const updated = bundleConfig.readNodes();
  await editor.switchToListView();
  for (const node of original) {
    const directory = node.bundleNodeName === 't001 ---- child 2' ? 'source-changes/nested/deeper' : 'source-changes/nested';
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)).toEqual({ ...node, sourceGraphSubdirectory: directory });
    await editor.expectListViewNodeVisible(`${directory}/${node.bundleNodeName}.md`, true);
  }
  await addKeyFrame(sourceSnapshot);
  await checkpoint('unchanged links reach the relocated group after acceptance');

  await skipMeadowHomeStateCheck();
});
