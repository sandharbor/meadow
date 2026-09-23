/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

/*
 * Move a source directory and repair its registered location. Captured pages should
 * survive the missing directory and change only after explicit acceptance.
 */
test('Multi-source relocation preserves captured pages and accepts the repaired location explicitly', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeConfig = bundleConfig.readText();
  const beforeNodes = bundleConfig.readNodesText();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Relocate the research source.
  await sourceChanges.apply('relocate-research', 'multi-source');
  await sources.open();
  await sources.expectDisconnected('source000002');
  await addKeyFrame(bundleSource);
  await snapshot('the disconnected source keeps its accepted captured pages');

  // Verify the captured pages and repair the source.
  await sources.close();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Overview.md', true);
  await sources.open();
  const relocated = path.join(testServer.sourceGraphsDir, 'multi-source/research-relocated');
  await sources.setDirectory('research', relocated);
  await sources.stage();
  await editor.sourceReview.expectReadyToAccept();
  expect(bundleConfig.readText()).toBe(beforeConfig);
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await addKeyFrame(sourceSnapshot);
  await snapshot('location repair is staged while accepted configuration remains intact');

  // Accept and reload the repaired location.
  const [draftStatus] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/curation/bundle-config-draft-status') && response.ok()),
    page.waitForResponse(response => response.url().includes('/curation/bundle-config') && response.ok()),
    page.waitForResponse(response => response.url().includes('/obsidian-info') && response.ok()),
    editor.sourceReview.accept(),
  ]);
  expect(bundleConfig.read().sources?.find(source => source.id === 'source000002')?.directory).toBe(relocated);
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  // The graph's configuration read starts a dependent draft-status request.
  // Finish that request before reload; networkidle may still describe the
  // earlier document load when this request has only just been scheduled.
  await draftStatus.finished();
  await page.reload();
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  await editor.switchToListView();
  await editor.expectListViewLocation('_mw_sources/source000002/Overview.md', 'research', '/');
  await snapshot('the accepted source location survives reloading the bundle');

  await skipMeadowHomeStateCheck();
});
