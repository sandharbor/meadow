/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, BundleListPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Turn off automatic tracking for newly accepted pages. A later source review should
 * remember that preference for the bundle.
 */
test('Sourcing remembers the bundle preference to leave new pages untracked', { annotation: { type: 'scenario-id', description: '1529fd21-a754-4e10-aa6e-d48eff2a6f10' } }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Add a linked page.
  await sourceCommand(() => sourceChanges.apply('add-linked-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectTrackNewPages(true));
  await sourceCommand(() => editor.sourceReview.setTrackNewPages(false));
  await sourceCommand(() => checkpoint('the new page is ready to accept with automatic tracking disabled'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added field notes'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('turning tracking off leaves the accepted addition untracked'));

  // Reopen the bundle.
  await sourceCommand(() => editor.clickBackToBundles());
  await sourceCommand(() => new BundleListPage(page, expect).clickBundle(Bundle.Big));
  await sourceCommand(() => editor.waitForLoad(Bundle.Big));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the bundle is reopened with its saved tracking preference'));

  // Add an embedded image.
  await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectTrackNewPages(false));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('a later source review restores the saved bundle preference'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added sunflower'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
  await sourceCommand(() => checkpoint('the later image also remains untracked'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
