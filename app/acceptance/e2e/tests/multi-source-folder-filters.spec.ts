/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, bundleSource, folderFilter, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source folder filters distinguish equal folder names and retain independent settings`);

const description = linkedScenarioDescription(conceptText`Hide one of two equally named folders in different sources, then rename that source. The
filter should keep affecting only the original source and remain resettable.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'ed923b4e-3481-433a-91e3-b9adb3190594' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000001/Overview.md', 'notes', '/'));
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Overview.md', 'research', '/'));
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.expectFolderCount('notes://', 5));
  await sourceCommand(() => filters.expectFolderCount('research://', 5));
  await sourceCommand(() => filters.expectFolderCount('reference://', 2));
  await sourceCommand(() => filters.expandFolder('notes://'));
  await sourceCommand(() => filters.expandFolder('research://'));
  await sourceCommand(() => filters.expectFolderCount('notes://Same', 1));
  await sourceCommand(() => filters.expectFolderCount('research://Same', 1));
  await sourceCommand(() => addKeyFrame(bundleSource, folderFilter));
  await sourceCommand(() => checkpoint('namesake pages and folders display their canonical source'));

  // --- Test start ---
  // Change the source-folder filters.
  await sourceCommand(() => filters.hideFolder('notes://Same'));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000001/Same/Inside.md', false));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Same/Inside.md', true));
  await sourceCommand(() => checkpoint("hiding one namesake folder leaves the other source visible"));

  // Rename the filtered source.
  const sources = new SourcesControl(page, expect);
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.rename('notes', 'notebook'));
  await sourceCommand(() => sources.saveWithoutMaterialChanges());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000001/Same/Inside.md', false));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Same/Inside.md', true));
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000001/Overview.md', 'notebook', '/'));
  await sourceCommand(() => filters.expectFolderVisible('notebook://Same'));
  await sourceCommand(() => addKeyFrame(folderFilter));
  await sourceCommand(() => checkpoint("the renamed source retains its folder filter"));

  // Reset the folder filters.
  await sourceCommand(() => filters.resetFolderFilters());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000001/Same/Inside.md', true));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Same/Inside.md', true));
  await sourceCommand(() => checkpoint("resetting the folder filter restores both namesake pages"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
