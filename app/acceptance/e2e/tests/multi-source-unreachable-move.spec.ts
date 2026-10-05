/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Move an accepted page to an unreachable destination in another source. Review should
 * report an orphan instead of assigning its identity to a page outside the bundle.
 */
test('Multi-source move to an unreachable destination remains an orphan instead of an admitted move', { annotation: { type: 'scenario-id', description: '2ed45de5-8a69-4a5f-abab-ff8388828500' } }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const original = bundleConfig.requireNode({ sourceId: 'source000001', bundleNodeName: 'Inside' });
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Move the page outside the reachable boundary.
  await sourceCommand(() => sourceChanges.apply('move-to-unreachable-source-path', 'multi-source'));
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/research/Unreachable/Inside.md'))).toBe(true);
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectNoRenames());
  await sourceCommand(() => editor.sourceReview.orphans.expectOrphanListed('Inside'));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('an indexed but unreachable destination does not justify a move match'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toBeUndefined();
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Unreachable/Inside.md', false));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Same/Inside.md', true));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the unrelated reachable namesake remains and the unreachable destination stays outside the bundle'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
