/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { bundleSource, folderBundles } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Sort a multi-source bundle by its Source column in flat and structural lists. Source
 * names should remain separate from folders and stay visible when filtering to one source.
 */
test('Multi-source list view sorts canonical source names in flat and structural views', { annotation: { type: 'scenario-id', description: '47643e99-1c78-4bf4-8431-3f8bc651479e' } }, async ({ sourceCommand, page, addKeyFrame, skipMeadowHomeStateCheck, checkpoint }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-mixed'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-mixed'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewSourceColumn(true));
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000001/Overview.md', 'notes', '/'));
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Overview.md', 'research', '/'));
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Same/Inside.md', 'research', 'Same'));
  await sourceCommand(() => checkpoint("the flat list identifies each source separately from its folder"));

  // --- Test start ---
  // Sort sources in the flat list.
  const ascendingSources = [
    '—',
    ...Array<string>(5).fill('notes'),
    ...Array<string>(2).fill('reference'),
    ...Array<string>(6).fill('research'),
  ];
  await sourceCommand(() => editor.clickListSort('Source'));
  await sourceCommand(() => editor.expectListViewSourceOrder(ascendingSources, 'ascending'));
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint("flat rows are sorted by ascending source name"));

  // Reverse the source order.
  await sourceCommand(() => editor.clickListSort('Source'));
  await sourceCommand(() => editor.expectListViewSourceOrder([...ascendingSources].reverse(), 'descending'));

  await sourceCommand(() => checkpoint("flat rows are sorted by descending source name"));

  // Check the structural list.
  await sourceCommand(() => editor.switchToStructuralListView());
  await sourceCommand(() => editor.expectListViewLocation('file:_mw_sources/source000002/Same/Inside.md', 'research', 'Same'));
  await sourceCommand(() => editor.expectListViewSourceOrder(['—', 'research', 'research', 'notes'], 'descending', 'selected-folders'));
  const outsideSources = [
    ...Array<string>(4).fill('notes'),
    ...Array<string>(2).fill('reference'),
    ...Array<string>(4).fill('research'),
  ];
  await sourceCommand(() => editor.expectListViewSourceOrder([...outsideSources].reverse(), 'descending', 'outside'));
  await sourceCommand(() => editor.clickListSort('Source'));
  await sourceCommand(() => editor.expectListViewSourceOrder(['—', 'notes', 'research', 'research'], 'ascending', 'selected-folders'));
  await sourceCommand(() => editor.expectListViewSourceOrder(outsideSources, 'ascending', 'outside'));
  await sourceCommand(() => addKeyFrame(bundleSource, folderBundles));

  await sourceCommand(() => checkpoint("both structural groups sort by canonical source name"));

  // Filter to one source.
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.soloFolder('notes://'));
  await sourceCommand(() => editor.expectListViewSourceColumn(true));
  await sourceCommand(() => editor.expectListViewSourceOrder(Array<string>(5).fill('notes'), 'ascending'));
  await sourceCommand(() => checkpoint("the source column stays visible when filtering a multi-source bundle"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
