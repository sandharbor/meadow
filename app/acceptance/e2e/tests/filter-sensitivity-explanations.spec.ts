/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, FilterPanelComponent, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { filters, filterSensitivity, sourceSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from '../../../concepts/index.js';
import { bigBundle } from '../src/bundle-docs/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Node hovers and the Sensitive badge explain matching filters without requiring a highlight`);
const description = linkedScenarioDescription(conceptText`Create sensitivity-only filters in Big. Graph and list node hovers name the matching
filter and its + sensitive action without a color marker. The selected node explains one or several
sensitivity filters, while a source-sensitive node explains its meadow-sensitive marking.`);
const areas = scenarioAreas([bundleCuration], { subAreas: [filters] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'aeea6748-a5bc-41e3-99eb-c17ba3fd8ab8' }, name.annotation, description.annotation, areas.annotation] }, async ({ sourceCommand, page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  const nodeKey = 'file:t013 ---- inlinks_depth - branch 2 - depth 1.md';
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('Big is ready to explain sensitivity'));

  // --- Test start ---
  // Apply a sensitivity-only filter and inspect a matching graph node.
  await sourceCommand(() => filterPanel.clickAddCustomFilter());
  await sourceCommand(() => filterPanel.fillAndSaveCustomFilter({ name: 'Private inlinks', field: 'title', matchType: 'substring', value: 'inlink', markSensitive: true }));
  await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
  await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => editor.sourceReview.close());
  await sourceCommand(() => filterPanel.enableAndSoloFilter('Private inlinks'));
  await sourceCommand(() => filterPanel.scrollFilterIntoView('Private inlinks'));
  await sourceCommand(() => editor.hoverGraphNode(nodeKey));
  await sourceCommand(() => editor.expectNodeHoverFilter('Private inlinks', { sensitive: true, colored: false }));
  await sourceCommand(() => addKeyFrame(filters, filterSensitivity));
  await sourceCommand(() => checkpoint('the graph hover names the sensitivity filter without a color marker'));

  // Explain the same match in the list and the selected node's Sensitive badge.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.hoverListNodeGlyph(nodeKey));
  await sourceCommand(() => editor.expectNodeHoverFilter('Private inlinks', { sensitive: true, colored: false }));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint('the list hover also shows the sensitivity action without a color marker'));

  // Inspect the reason for the selected node's sensitivity.
  await sourceCommand(() => editor.clickListViewRowByNodeKey(nodeKey));
  await sourceCommand(() => detail.hoverSensitivityExplanation(['Marked sensitive by this enabled filter:', 'Private inlinks']));
  await sourceCommand(() => addKeyFrame(filterSensitivity));
  await sourceCommand(() => checkpoint('the selected node names its sensitivity filter'));

  // Add a second sensitivity filter and show both causes.
  await sourceCommand(() => filterPanel.clickAddCustomFilter());
  await sourceCommand(() => filterPanel.fillAndSaveCustomFilter({ name: 'Private branches', field: 'title', matchType: 'substring', value: 'branch', markSensitive: true }));
  await sourceCommand(() => editor.sourceReview.expectSensitivityReviewReady());
  await sourceCommand(() => editor.sourceReview.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => editor.sourceReview.close());
  await sourceCommand(() => detail.hoverSensitivityExplanation(['Marked sensitive by these enabled filters:', 'Private inlinks', 'Private branches']));
  await sourceCommand(() => addKeyFrame(filterSensitivity));
  await sourceCommand(() => checkpoint('the selected node lists both filters supplying sensitivity'));

  // Inspect a node whose sensitivity is declared in its source.
  await sourceCommand(() => filterPanel.clickSoloOnFilter('Private inlinks'));
  await sourceCommand(() => editor.clickSelectNone());
  await sourceCommand(() => editor.clickListViewRowByNodeKey('file:t004 ---- sensitive page.md'));
  await sourceCommand(() => detail.hoverSensitivityExplanation(['meadow-sensitive is marked in the source.']));
  await sourceCommand(() => addKeyFrame(sourceSensitivity));
  await sourceCommand(() => checkpoint('the source-sensitive node explains its source marking'));

  void bigBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
