/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing remembers the bundle preference to leave new pages untracked', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await sourceChanges.apply('add-linked-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectTrackNewPages(true);
  await editor.sourceReview.setTrackNewPages(false);
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added field notes');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked);
  await addKeyFrame(sourceSnapshot);
  await snapshot('turning tracking off leaves the accepted addition untracked');
  await workflows.navigateToBigBundle();
  await editor.waitForSourceCheck();
  await sourceChanges.apply('add-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectTrackNewPages(false);
  await addKeyFrame(sourceSnapshot);
  await snapshot('a later source review restores the saved bundle preference');
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added sunflower');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked);
  await skipMeadowHomeStateCheck();
});
