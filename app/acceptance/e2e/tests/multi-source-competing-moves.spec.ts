/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source competing moves never assign the old identity to either identical destination', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const config = path.join(testServer.configDir, 'bundles/multi-source-page/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.sourceId === 'source000001' && node.bundleNodeName === 'Inside')!;
  expect(original).toBeDefined();
  await sourceChanges.apply('competing-cross-source-moves', 'multi-source');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  const move = await editor.sourceReview.moveForNode(original.bundleNodeId);
  await move.expandDetails();
  await move.expectUnresolved(['research://Moved/Inside.md', 'reference://Moved/Inside.md']);
  await editor.sourceReview.expectIdentityChoiceRequired();
  expect(parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId)).toEqual(original);
  await addKeyFrame(sourceMove);
  await snapshot('two equally plausible destinations require an explicit identity choice');
  await move.keepSeparate();
  await editor.sourceReview.expectReadyToAccept();
  await editor.sourceReview.accept();
  const updated = parseBundleNodeConfig(fs.readFileSync(config, 'utf8'));
  expect(updated.filter(node => node.bundleNodeName === 'Inside' && node.sourceGraphSubdirectory === 'Moved')).toEqual([]);
  expect(updated.some(node => node.bundleNodeId === original.bundleNodeId)).toBe(false);
  await editor.switchToListView();
  for (const source of ['source000002', 'source000003']) await editor.expectListViewNodeVisible(`_mw_sources/${source}/Moved/Inside.md`, true);
  await addKeyFrame(sourceSnapshot);
  await snapshot('explicitly keeping pages separate removes the old identity and leaves both new pages untracked');
  await skipMeadowHomeStateCheck();
});
