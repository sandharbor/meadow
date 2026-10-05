/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot, sourceChange } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Rename a linked group of pages and review it. Meadow should classify the group once and
 * avoid treating its members as unrelated orphans.
 */
test('Sourcing classifies a renamed linked group once and keeps its pages out of orphan cleanup', { annotation: { type: 'scenario-id', description: '107cf0b5-3e9e-4e5d-a0c8-23764a050e6c' } }, async ({ sourceCommand, page, sourceChanges, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.readNodes().filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Rename the linked group.
  await sourceCommand(() => sourceChanges.apply('rename-linked-group'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.expectSourceOrphanCount(13));
  await sourceCommand(() => expect(page.getByRole('button', { name: '17 source changes available – Review', exact: true })).toBeVisible());
  const review = editor.sourceReview;
  await sourceCommand(() => review.open());
  await sourceCommand(() => review.expectMoveCount(3));
  for (const node of original) {
    await sourceCommand(() => review.expectMoveListed(node.bundleNodeId));
  }
  await sourceCommand(() => review.confirmSuggestedIdentities());
  await sourceCommand(() => review.continueToGraph());
  for (const node of original) await sourceCommand(() => review.orphans.expectNotListed(node.bundleNodeName));
  await sourceCommand(() => review.orphans.expectSummaryCount(13));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('three linked moves form review items while existing unrelated orphans remain separate'));

  // Inspect the updated links.
  await sourceCommand(() => review.expandDetails('t001 - deeply nested.md'));
  await sourceCommand(() => review.expectInlineChanges('t001 - deeply nested.md', ['0', '0', '0'], ['1', '1', '1']));
  await sourceCommand(() => addKeyFrame(sourceChange));
  await sourceCommand(() => checkpoint('minor link edits highlight only the changed digits'));

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  const updated = bundleConfig.readNodes();
  for (const node of original) {
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)?.bundleNodeName).toBe(node.bundleNodeName.replace('t001', 't101'));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the group preserves all three identities after accepting the source update'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
