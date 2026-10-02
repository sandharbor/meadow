/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Fixture } from '../src/run/workflows.js';
import {
  BundleEditorPage, BundleListPage, FilterPanelComponent, Pill, SelectedPageDetailComponent,
} from '../src/run/pages/index.js';
import { sourcingReviewRedesign, overrides, sourceSnapshot, bundleNodeKey } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * Remove the example bundle's zero-depth override and accept the three pages newly
 * reached by its inherited depth. Acceptance should track them without a recovery notice.
 */
test('Removing the example depth override tracks newly accepted pages', async ({
  page, checkpoint, addKeyFrame, assertMeadowHomeState,
}) => {
  // --- Setup ---
  const editor = new BundleEditorPage(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);
  const additions = ['Availability Bias', 'Confirmation Bias', 'Survivorship Bias'];
  await bundleList.goto();
  await bundleList.clickBundle(Bundle.Example);
  await editor.waitForLoad(Bundle.Example);
  await editor.waitForSourceCheck();
  await checkpoint('the example bundle is ready with its original depth override');

  // --- Test start ---
  // Select the only overridden page in the graph.
  await filterPanel.enableFilter('Depth Override');
  await filterPanel.clickSoloOnFilter('Depth Override');
  await editor.expectGraphViewPageCount(1);
  await page.getByTestId('graph-page-node').click();
  await expect.poll(() => editor.getSelectedPageTitles()).toEqual(['Cognitive Biases']);
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.openDetails();
  await detail.expectRemoveOutlinksDepthVisible();
  await addKeyFrame(overrides);
  await checkpoint('Cognitive Biases is selected with its zero-depth override');

  // Removing the override opens the isolated comparison workspace.
  await detail.removeOutlinksDepthOverride();
  await expect(editor.sourceReview.root).toBeVisible();
  await addKeyFrame(overrides);
  await checkpoint('the inherited boundary and its newly reached pages await acceptance');

  await editor.sourceReview.expectTrackNewPages(true);
  for (const name of additions) {
    await editor.sourceReview.expectAdded(`${name}.md`);
  }
  await addKeyFrame(sourceSnapshot);
  await checkpoint('all three newly reachable pages are ready for acceptance and tracking');

  // Accept the source update and verify automatic tracking completed.
  await editor.sourceReview.accept();
  await addKeyFrame(sourceSnapshot);
  await expect(page.getByRole('alert').filter({ hasText: 'automatic tracking could not finish' })).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Tracking added pages', exact: true })).not.toBeVisible();
  await filterPanel.clickSoloOnFilter('Depth Override');
  await editor.switchToListView();
  await editor.clickSelectNone();
  for (const name of additions) {
    await editor.clickListViewRowByExactName(name);
    await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked);
    await editor.clickSelectNone();
  }
  await addKeyFrame(bundleNodeKey);
  await checkpoint('all three accepted pages are tracked without an error');

  await assertMeadowHomeState();
});
