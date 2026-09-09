/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { ActionButton, BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { frontierEmbeddedAssets } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('a plain link to an image beyond the boundary stays untrackable in the live frontier', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  await sourceChanges.apply('link-frontier-image');
  const editor = new BundleEditorPage(page, expect);
  await editor.sourceReview.open();
  await editor.sourceReview.checkAgain();
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
