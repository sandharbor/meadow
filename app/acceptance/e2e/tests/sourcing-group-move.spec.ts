/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot, sourceChange } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Rename a linked group of pages and review it. Meadow should classify the group once and
 * avoid treating its members as unrelated orphans.
 */
test('Sourcing classifies a renamed linked group once and keeps its pages out of orphan cleanup', async ({ page, sourceChanges, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.readNodes().filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Rename the linked group.
  await sourceChanges.apply('rename-linked-group');
  await editor.checkSourceChanges();
  await editor.expectSourceOrphanCount(13);
  await expect(page.getByRole('button', { name: '17 source changes available – Review', exact: true })).toBeVisible();
  const review = editor.sourceReview;
  await review.open();
  await review.expectMoveCount(3);
  for (const node of original) {
    await review.expectMoveListed(node.bundleNodeId);
    await review.orphans.expectNotListed(node.bundleNodeName);
  }
  await review.orphans.expectSummaryCount(13);
  await addKeyFrame(sourceMove);
  await checkpoint('three linked moves form review items while existing unrelated orphans remain separate');

  // Inspect the updated links.
  await review.expandDetails('t001 - deeply nested.md');
  await review.expectInlineChanges('t001 - deeply nested.md', ['0', '0', '0'], ['1', '1', '1']);
  await addKeyFrame(sourceChange);
  await checkpoint('minor link edits highlight only the changed digits');

  // Accept the source update.
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  const updated = bundleConfig.readNodes();
  for (const node of original) {
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)?.bundleNodeName).toBe(node.bundleNodeName.replace('t001', 't101'));
  }
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the group preserves all three identities after accepting the source update');

  await skipMeadowHomeStateCheck();
});
