/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, BundleListPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Turn off automatic tracking for newly accepted pages. A later source review should
 * remember that preference for the bundle.
 */
test('Sourcing remembers the bundle preference to leave new pages untracked', async ({ page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Add a linked page.
  await sourceChanges.apply('add-linked-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectTrackNewPages(true);
  await editor.sourceReview.setTrackNewPages(false);
  await checkpoint('the new page is ready to accept with automatic tracking disabled');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added field notes');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('turning tracking off leaves the accepted addition untracked');

  // Reopen the bundle.
  await editor.clickBackToBundles();
  await new BundleListPage(page, expect).clickBundle(Bundle.Big);
  await editor.waitForLoad(Bundle.Big);
  await editor.waitForSourceCheck();
  await checkpoint('the bundle is reopened with its saved tracking preference');

  // Add an embedded image.
  await sourceChanges.apply('add-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectTrackNewPages(false);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('a later source review restores the saved bundle preference');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added sunflower');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked);
  await checkpoint('the later image also remains untracked');

  await skipMeadowHomeStateCheck();
});
