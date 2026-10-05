/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, bundleSource } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Move a source directory and repair its registered location. Captured pages should
 * survive the missing directory. Saving the repaired location should close source
 * management with a success message and no material review.
 */
test('Multi-source relocation saves the repaired location without reviewing unchanged material', { annotation: { type: 'scenario-id', description: '9e553a56-7e3c-408c-ab79-53e03fae54c0' } }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeNodes = bundleConfig.readNodesText();
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Relocate the research source.
  await sourceCommand(() => sourceChanges.apply('relocate-research', 'multi-source'));
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.expectDisconnected('source000002'));
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('the disconnected source keeps its accepted captured pages'));

  // Verify the captured pages and repair the source.
  await sourceCommand(() => sources.close());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Overview.md', true));
  await sourceCommand(() => sources.open());
  const relocated = path.join(testServer.sourceGraphsDir, 'multi-source/research-relocated');
  await sourceCommand(() => sources.setDirectory('research', relocated));
  const [draftStatus] = await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/curation/bundle-config-draft-status') && response.ok()),
    page.waitForResponse(response => response.url().includes('/curation/bundle-config') && response.ok()),
    page.waitForResponse(response => response.url().includes('/obsidian-info') && response.ok()),
    sources.saveWithoutMaterialChanges(),
  ]));
  expect(bundleConfig.read().sources?.find(source => source.id === 'source000002')?.directory).toBe(relocated);
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('reconnecting the source closes management with Sources updated and no material review'));

  // Reload the repaired location.
  // The graph's configuration read starts a dependent draft-status request.
  // Finish that request before reload; networkidle may still describe the
  // earlier document load when this request has only just been scheduled.
  await sourceCommand(() => draftStatus.finished());
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Overview.md', 'research', '/'));
  await sourceCommand(() => checkpoint('the accepted source location survives reloading the bundle'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
