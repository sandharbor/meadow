/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

/*
 * Make one registered source unavailable. Captured pages should remain usable until the
 * source is explicitly removed and the removal is accepted.
 */
test('Multi-source disconnection preserves captured pages until the source is explicitly removed', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeNodes = bundleConfig.readNodesText();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Disconnect the reference source.
  await sourceChanges.apply('disconnect-reference', 'multi-source');
  await sources.open();
  await sources.expectDisconnected('source000003');
  await addKeyFrame(bundleSource);
  await snapshot('a disconnected source is identified without discarding its captured material');

  // Verify the captured pages remain available.
  await sources.close();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await snapshot('captured pages and configuration remain intact while the source is disconnected');

  // Remove the reference source.
  await sources.open();
  await sources.remove('source000003');
  await sources.stage();
  await editor.sourceReview.orphans.expectOrphanListed('Study');
  await editor.sourceReview.orphans.expectOrphanListed('Appendix');
  await addKeyFrame(sourceSnapshot);
  await snapshot('deliberate removal offers orphan cleanup for the disconnected source');

  // Accept the source update.
  await editor.sourceReview.accept();
  const config = bundleConfig.read();
  expect(config.sources?.map(source => source.id)).toEqual(['source000001', 'source000002']);
  expect(bundleConfig.readNodes().some(node => node.sourceId === 'source000003')).toBe(false);
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', false);
  await snapshot('acceptance removes the disconnected source and its orphaned configuration');

  await skipMeadowHomeStateCheck();
});
