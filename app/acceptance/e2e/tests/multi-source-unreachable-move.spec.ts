/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Move an accepted page to an unreachable destination in another source. Review should
 * report an orphan instead of assigning its identity to a page outside the bundle.
 */
test('Multi-source move to an unreachable destination remains an orphan instead of an admitted move', async ({ page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const original = bundleConfig.requireNode({ sourceId: 'source000001', bundleNodeName: 'Inside' });
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Move the page outside the reachable boundary.
  await sourceChanges.apply('move-to-unreachable-source-path', 'multi-source');
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/research/Unreachable/Inside.md'))).toBe(true);
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectNoRenames();
  await editor.sourceReview.orphans.expectOrphanListed('Inside');
  await addKeyFrame(sourceMove);
  await checkpoint('an indexed but unreachable destination does not justify a move match');

  // Accept the source update.
  await editor.sourceReview.accept();
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toBeUndefined();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Unreachable/Inside.md', false);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the unrelated reachable namesake remains and the unreachable destination stays outside the bundle');

  await skipMeadowHomeStateCheck();
});
