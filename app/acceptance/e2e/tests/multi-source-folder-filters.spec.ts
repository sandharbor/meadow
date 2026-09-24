/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, folderFilter } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

/*
 * Hide one of two equally named folders in different sources, then rename that source. The
 * filter should keep affecting only the original source and remain resettable.
 */
test('Multi-source folder filters distinguish equal folder names and retain independent settings', async ({ page, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  await editor.switchToListView();
  await editor.expectListViewLocation('_mw_sources/source000001/Overview.md', 'notes', '/');
  await editor.expectListViewLocation('_mw_sources/source000002/Overview.md', 'research', '/');
  const filters = new FilterPanelComponent(page, expect);
  await filters.expandFilterGroup('Folders');
  await filters.expectFolderCount('notes://', 5);
  await filters.expectFolderCount('research://', 5);
  await filters.expectFolderCount('reference://', 2);
  await filters.expandFolder('notes://');
  await filters.expandFolder('research://');
  await filters.expectFolderCount('notes://Same', 1);
  await filters.expectFolderCount('research://Same', 1);
  await addKeyFrame(bundleSource, folderFilter);
  await snapshot('namesake pages and folders display their canonical source');

  // --- Test start ---
  // Change the source-folder filters.
  await filters.hideFolder('notes://Same');
  await editor.expectListViewNodeVisible('_mw_sources/source000001/Same/Inside.md', false);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  await snapshot("hiding one namesake folder leaves the other source visible");

  // Rename the filtered source.
  const sources = new SourcesControl(page, expect);
  await sources.open();
  await sources.rename('notes', 'notebook');
  await sources.saveWithoutMaterialChanges();
  await editor.expectListViewNodeVisible('_mw_sources/source000001/Same/Inside.md', false);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  await editor.expectListViewLocation('_mw_sources/source000001/Overview.md', 'notebook', '/');
  await filters.expectFolderVisible('notebook://Same');
  await addKeyFrame(folderFilter);
  await snapshot("the renamed source retains its folder filter");

  // Reset the folder filters.
  await filters.resetFolderFilters();
  await editor.expectListViewNodeVisible('_mw_sources/source000001/Same/Inside.md', true);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  await snapshot("resetting the folder filter restores both namesake pages");

  await skipMeadowHomeStateCheck();
});
