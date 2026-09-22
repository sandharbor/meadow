/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot, sourceMove } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source move review preserves the accepted page identity and its curation', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const configDir = path.join(testServer.configDir, 'bundles/multi-source-page/config');
  const nodesFile = path.join(configDir, 'bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8')).find(node => node.sourceId === 'source000001' && node.bundleNodeName === 'Inside')!;
  await sourceChanges.apply('move-between-sources', 'multi-source');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  await editor.sourceReview.expectMoveListed(original.bundleNodeId);
  await editor.sourceReview.expectMove('Moved', 'notes://Same/Inside.md', 'research://Moved/Inside.md');
  await editor.sourceReview.orphans.expectNotListed('Inside');
  await addKeyFrame(sourceMove);
  await snapshot('content and link context support a move into another source');
  await editor.sourceReview.accept();
  const updated = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId);
  expect(updated).toEqual({ ...original, sourceId: 'source000002', sourceGraphSubdirectory: 'Moved' });
  await editor.switchToListView();
  await editor.expectListViewLocation('_mw_sources/source000002/Moved/Inside.md', 'research', 'Moved');
  await editor.clickListViewRowByNodeKey('_mw_sources/source000002/Moved/Inside.md');
  await editor.switchToGraphView();
  const details = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await details.openDetails();
  await details.expectFolder('research://Moved');
  await addKeyFrame(sourceSnapshot);
  await snapshot('the moved page retains its durable identity and tracking');
  await skipMeadowHomeStateCheck();
});
