/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source move to an unreachable destination remains an orphan instead of an admitted move', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const config = path.join(testServer.configDir, 'bundles/multi-source-page/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.sourceId === 'source000001' && node.bundleNodeName === 'Inside')!;
  expect(original).toBeDefined();
  await sourceChanges.apply('move-to-unreachable-source-path', 'multi-source');
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/research/Unreachable/Inside.md'))).toBe(true);
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectNoRenames();
  await editor.sourceReview.orphans.expectOrphanListed('Inside');
  await addKeyFrame(sourceMove);
  await snapshot('an indexed but unreachable destination does not justify a move match');
  await editor.sourceReview.accept();
  expect(parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).some(node => node.bundleNodeId === original.bundleNodeId)).toBe(false);
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Unreachable/Inside.md', false);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the unrelated reachable namesake remains and the unreachable destination stays outside the bundle');
  await skipMeadowHomeStateCheck();
});
