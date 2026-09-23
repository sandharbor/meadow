/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { ActionButton, BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { frontierEmbeddedAssets } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

/*
 * Add a plain link to an image beyond the traversal boundary. The live frontier should
 * show it without allowing it to be tracked there.
 */
test('a plain link to an image beyond the boundary stays untrackable in the live frontier', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Replace the image embed with a plain link.
  await sourceChanges.apply('link-frontier-image');
  const editor = new BundleEditorPage(page, expect);
  await editor.sourceReview.open();
  await editor.sourceReview.checkAgain();
  await editor.sourceReview.expectNoLongerIncluded('t016 ---- level 5 - frontier image.png');
  await editor.sourceReview.orphans.expectNotListed('t016 ---- level 5 - frontier image');
  await addKeyFrame(frontierEmbeddedAssets);
  await snapshot('the formerly embedded image is no longer included, without orphaned configuration');

  // Accept the source update.
  await editor.sourceReview.accept();
  await new FilterPanelComponent(page, expect).enableFilter('Frontier');
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('t016 ---- level 5 - frontier image');
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.expectPill(Pill.Frontier);
  await detail.expectNoPill(Pill.FrontierImage);
  await detail.expectButtonDisabled(ActionButton.Track);
  await addKeyFrame(frontierEmbeddedAssets);
  await snapshot('an ordinary image link has the same frontier restrictions as a linked note');

  await skipMeadowHomeStateCheck();
});
