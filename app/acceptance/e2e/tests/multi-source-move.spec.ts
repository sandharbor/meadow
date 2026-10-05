/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, sourceMove } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Move a captured page into another source and review the proposed match. Accepting the
 * move should preserve its stable identity and curation.
 */
test('Multi-source move review preserves the accepted page identity and its curation', { annotation: { type: 'scenario-id', description: '25840ba8-3533-4257-8e57-ecd39d614a23' } }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
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
  // Move the page into another source.
  await sourceCommand(() => sourceChanges.apply('move-between-sources', 'multi-source'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectMoveCount(1));
  await sourceCommand(() => editor.sourceReview.expectMoveListed(original.bundleNodeId));
  await sourceCommand(() => editor.sourceReview.expectMove('Moved', 'notes://Same/Inside.md', 'research://Moved/Inside.md'));
  await sourceCommand(() => editor.sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.orphans.expectNotListed('Inside'));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('content and link context support a move into another source'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  const updated = bundleConfig.findNode({ bundleNodeId: original.bundleNodeId });
  expect(updated).toEqual({ ...original, sourceId: 'source000002', sourceGraphSubdirectory: 'Moved' });
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Moved/Inside.md', 'research', 'Moved'));
  await sourceCommand(() => editor.clickListViewRowByNodeKey('file:_mw_sources/source000002/Moved/Inside.md'));
  await sourceCommand(() => editor.switchToGraphView());
  const details = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => details.openDetails());
  await sourceCommand(() => details.expectFolder('research://Moved'));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the moved page retains its durable identity and tracking'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
