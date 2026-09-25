/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot, sourceMove } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Move a captured page into another source and review the proposed match. Accepting the
 * move should preserve its stable identity and curation.
 */
test('Multi-source move review preserves the accepted page identity and its curation', async ({ page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
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
  // Move the page into another source.
  await sourceChanges.apply('move-between-sources', 'multi-source');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  await editor.sourceReview.expectMoveListed(original.bundleNodeId);
  await editor.sourceReview.expectMove('Moved', 'notes://Same/Inside.md', 'research://Moved/Inside.md');
  await editor.sourceReview.orphans.expectNotListed('Inside');
  await addKeyFrame(sourceMove);
  await checkpoint('content and link context support a move into another source');

  // Accept the source update.
  await editor.sourceReview.accept();
  const updated = bundleConfig.findNode({ bundleNodeId: original.bundleNodeId });
  expect(updated).toEqual({ ...original, sourceId: 'source000002', sourceGraphSubdirectory: 'Moved' });
  await editor.switchToListView();
  await editor.expectListViewLocation('_mw_sources/source000002/Moved/Inside.md', 'research', 'Moved');
  await editor.clickListViewRowByNodeKey('_mw_sources/source000002/Moved/Inside.md');
  await editor.switchToGraphView();
  const details = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await details.openDetails();
  await details.expectFolder('research://Moved');
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the moved page retains its durable identity and tracking');

  await skipMeadowHomeStateCheck();
});
