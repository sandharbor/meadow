/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { scenarioSections, bundleSource, folderBundles, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source list view sorts canonical source names in flat and structural views`);

const description = linkedScenarioDescription(conceptText`Sort a multi-source bundle by its Source column in flat and structural lists. Source
names should remain separate from folders and stay visible when filtering to one source.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the flat list identifies each source separately from its folder.` },
  sortSourcesInFlatList: { type: 'test', text: conceptText`Sort sources in the flat list.` },
  reverseSourceOrder: { type: 'test', text: conceptText`Reverse the source order.` },
  checkStructuralList: { type: 'test', text: conceptText`Check the structural list.` },
  filterOneSource: { type: 'test', text: conceptText`Filter to one source.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '47643e99-1c78-4bf4-8431-3f8bc651479e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, addKeyFrame, skipMeadowHomeStateCheck, checkpoint }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
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
    return { editor };
  });

  const { ascendingSources } = await test.step(sections.steps.sortSourcesInFlatList, async () => {
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
    return { ascendingSources };
  });

  await test.step(sections.steps.reverseSourceOrder, async () => {
    await sourceCommand(() => editor.clickListSort('Source'));
    await sourceCommand(() => editor.expectListViewSourceOrder([...ascendingSources].reverse(), 'descending'));

    await sourceCommand(() => checkpoint("flat rows are sorted by descending source name"));
  });

  await test.step(sections.steps.checkStructuralList, async () => {
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
  });

  await test.step(sections.steps.filterOneSource, async () => {
    const filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filters.expandFilterGroup('Folders'));
    await sourceCommand(() => filters.soloFolder('notes://'));
    await sourceCommand(() => editor.expectListViewSourceColumn(true));
    await sourceCommand(() => editor.expectListViewSourceOrder(Array<string>(5).fill('notes'), 'ascending'));
    await sourceCommand(() => checkpoint("the source column stays visible when filtering a multi-source bundle"));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
