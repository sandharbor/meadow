/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { scenarioSections, filters, filterSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from '../../../concepts/index.js';
import { bigBundle } from '../src/bundle-docs/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Adding Highlight to a saved sensitivity filter immediately highlights its matching nodes`);
const description = linkedScenarioDescription(conceptText`In Big, save a custom filter that marks matching nodes sensitive. Reopen the filter,
add a Highlight action, and save again. The matching nodes should immediately show highlight rings
while retaining their sensitivity.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: Big is ready to create a sensitivity filter.` },
  saveSensitivityOnlyFilterInspectSevenMatching: { type: 'test', text: conceptText`Save a sensitivity-only filter and inspect its seven matching nodes.` },
  deferTrackingReviewOpenedBySensitivityPolicy: { type: 'test', text: conceptText`Defer the tracking review opened by the sensitivity policy.` },
  reopenSavedFilterAddHighlightAlongsideMark: { type: 'test', text: conceptText`Reopen the saved filter and add Highlight alongside Mark Sensitive.` },
  saveCaptureGraphBeforeAssertingExpectedImmediate: { type: 'test', text: conceptText`Save and capture the graph before asserting the expected immediate highlight.` },
});
const areas = scenarioAreas([bundleCuration], { subAreas: [filters] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '488196c6-95c0-4d4b-999b-596b56cf2732' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, filterPanel, filterName } = await test.step(sections.steps.setup, async () => {
    const editor = new BundleEditorPage(page, expect);
    const filterPanel = new FilterPanelComponent(page, expect);
    const filterName = 'Private inlinks';
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('Big is ready to create a sensitivity filter'));
    return { editor, filterPanel, filterName };
  });

  await test.step(sections.steps.saveSensitivityOnlyFilterInspectSevenMatching, async () => {
    await sourceCommand(() => filterPanel.clickAddCustomFilter());
    await sourceCommand(() => filterPanel.fillAndSaveCustomFilter({
      name: filterName,
      field: 'title',
      matchType: 'substring',
      value: 'inlink',
      markSensitive: true,
    }));
  });

  await test.step(sections.steps.deferTrackingReviewOpenedBySensitivityPolicy, async () => {
    await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
    await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => editor.sourceReview.close());
    await sourceCommand(() => filterPanel.enableAndSoloFilter(filterName));
    await sourceCommand(() => editor.expectGraphViewPageCount(7));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickSelectAll());
    const titles = await sourceCommand(() => editor.getSelectedPageTitles());
    expect(titles).toHaveLength(7);
    for (const title of titles) expect(title.toLowerCase()).toContain('inlink');
    await sourceCommand(() => editor.expectSelectedSensitivePageCount(7));
    await sourceCommand(() => editor.clickSelectNone());
    await sourceCommand(() => editor.switchToGraphView());
    await sourceCommand(() => editor.expectGraphHighlightCount('#FFD700', 0));
    await sourceCommand(() => filterPanel.scrollFilterIntoView(filterName));
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('the saved filter marks seven nodes sensitive without highlighting them'));
  });

  await test.step(sections.steps.reopenSavedFilterAddHighlightAlongsideMark, async () => {
    await sourceCommand(() => filterPanel.editCustomFilter(filterName));
    await sourceCommand(() => filterPanel.addHighlightToSensitivityFilterEdits());
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => checkpoint('the reopened filter contains both Mark Sensitive and Highlight before saving'));
  });

  await test.step(sections.steps.saveCaptureGraphBeforeAssertingExpectedImmediate, async () => {
    await sourceCommand(() => filterPanel.saveCustomFilterEdits({}));
    await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
    await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => editor.sourceReview.close());
    await sourceCommand(() => editor.expectGraphViewPageCount(7));
    await sourceCommand(() => filterPanel.scrollFilterIntoView(filterName));
    await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
    await sourceCommand(() => checkpoint('the filter is saved with the added Highlight action'));
    await sourceCommand(() => editor.expectGraphHighlightCount('#FFD700', 7));
  });

  void bigBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
