/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { bundleSource, folderBundles } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source list view sorts canonical source names in flat and structural views', async ({ page, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-mixed');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-mixed');
  await editor.waitForSourceCheck();
  await editor.switchToListView();
  await editor.expectListViewSourceColumn(true);
  await editor.expectListViewLocation('_mw_sources/source000001/Overview.md', 'notes', '/');
  await editor.expectListViewLocation('_mw_sources/source000002/Overview.md', 'research', '/');
  await editor.expectListViewLocation('_mw_sources/source000002/Same/Inside.md', 'research', 'Same');
  const ascendingSources = [
    '—',
    ...Array<string>(5).fill('notes'),
    ...Array<string>(2).fill('reference'),
    ...Array<string>(6).fill('research'),
  ];
  await editor.clickListSort('Source');
  await editor.expectListViewSourceOrder(ascendingSources, 'ascending');
  await addKeyFrame(bundleSource);
  await editor.clickListSort('Source');
  await editor.expectListViewSourceOrder([...ascendingSources].reverse(), 'descending');

  await editor.switchToStructuralListView();
  await editor.expectListViewLocation('_mw_sources/source000002/Same/Inside.md', 'research', 'Same');
  await editor.expectListViewSourceOrder(['—', 'research', 'research', 'notes'], 'descending', 'selected-folders');
  const outsideSources = [
    ...Array<string>(4).fill('notes'),
    ...Array<string>(2).fill('reference'),
    ...Array<string>(4).fill('research'),
  ];
  await editor.expectListViewSourceOrder([...outsideSources].reverse(), 'descending', 'outside');
  await editor.clickListSort('Source');
  await editor.expectListViewSourceOrder(['—', 'notes', 'research', 'research'], 'ascending', 'selected-folders');
  await editor.expectListViewSourceOrder(outsideSources, 'ascending', 'outside');
  await addKeyFrame(bundleSource, folderBundles);

  const filters = new FilterPanelComponent(page, expect);
  await filters.expandFilterGroup('Folders');
  await filters.soloFolder('notes');
  await editor.expectListViewSourceColumn(true);
  await editor.expectListViewSourceOrder(Array<string>(5).fill('notes'), 'ascending');
  await skipMeadowHomeStateCheck();
});
