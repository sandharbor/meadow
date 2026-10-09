/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Fixture } from '../src/run/workflows.js';
import {
  BundleEditorPage, BundleListPage, FilterPanelComponent, Pill, SelectedPageDetailComponent,
} from '../src/run/pages/index.js';
import { sourcingReviewRedesign, overrides, sourceSnapshot, bundleNodeKey, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

const name = linkedScenarioName(conceptText`Removing the example depth override tracks the newly reached pages by default`);

const description = linkedScenarioDescription(conceptText`Remove the example bundle's zero-depth override and accept the three pages newly
reached by its inherited depth. Track added pages is on, so the newly admitted pages are tracked.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b3137f45-5155-4892-9e2e-f3a0a08da7c6' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, addKeyFrame, assertMeadowHomeState,
}) => {
  // --- Setup ---
  const editor = new BundleEditorPage(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);
  const additions = ['Availability Bias', 'Confirmation Bias', 'Survivorship Bias'];
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickBundle(Bundle.Example));
  await sourceCommand(() => editor.waitForLoad(Bundle.Example));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the example bundle is ready with its original depth override'));

  // --- Test start ---
  // Select the only overridden page in the graph.
  await sourceCommand(() => filterPanel.enableFilter('Depth Override'));
  await sourceCommand(() => filterPanel.clickSoloOnFilter('Depth Override'));
  await sourceCommand(() => editor.expectGraphViewPageCount(1));
  await sourceCommand(() => page.getByTestId('graph-page-node').click());
  await sourceCommand(() => expect.poll(() => editor.getSelectedPageTitles()).toEqual(['Cognitive Biases']));
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.openDetails());
  await sourceCommand(() => detail.expectRemoveOutlinksDepthVisible());
  await sourceCommand(() => addKeyFrame(overrides));
  await sourceCommand(() => checkpoint('Cognitive Biases is selected with its zero-depth override'));

  // Removing the override opens the isolated comparison workspace.
  await sourceCommand(() => detail.removeOutlinksDepthOverride());
  await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
  await sourceCommand(() => addKeyFrame(overrides));
  await sourceCommand(() => checkpoint('the inherited boundary and its newly reached pages await acceptance'));

  await sourceCommand(() => editor.sourceReview.expectTrackAdditions(true));
  for (const name of additions) {
    await sourceCommand(() => editor.sourceReview.expectAdded(`${name}.md`));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('all three newly reachable pages are ready for acceptance and later curation'));

  // Accept the source update and verify the additions are tracked.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => expect(page.getByRole('alert').filter({ hasText: 'automatic tracking could not finish' })).not.toBeVisible());
  await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Tracking added pages', exact: true })).not.toBeVisible());
  await sourceCommand(() => filterPanel.clickSoloOnFilter('Depth Override'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickSelectNone());
  for (const name of additions) {
    await sourceCommand(() => editor.clickListViewRowByExactName(name));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
    await sourceCommand(() => editor.clickSelectNone());
  }
  await sourceCommand(() => addKeyFrame(bundleNodeKey));
  await sourceCommand(() => checkpoint('all three accepted pages are tracked'));

  await sourceCommand(() => assertMeadowHomeState());
});
