/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, BundleListPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Turning off Track added pages applies to one review; the next review starts with it on`);

const description = linkedScenarioDescription(conceptText`Turn off Track added pages and accept a new page untracked. After reopening the bundle, a
later review starts with Track added pages on again and accepts its addition tracked.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '1529fd21-a754-4e10-aa6e-d48eff2a6f10' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
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
  await sourceCommand(() => editor.sourceReview.expectTrackAdditions(true));
  await sourceCommand(() => editor.sourceReview.setTrackAdditions(false));
  await sourceCommand(() => checkpoint('Track added pages is turned off for this review'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added field notes'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('acceptance leaves the accepted addition untracked'));

  // Reopen the bundle.
  await sourceCommand(() => editor.clickBackToBundles());
  await sourceCommand(() => new BundleListPage(page, expect).clickBundle(Bundle.Big));
  await sourceCommand(() => editor.waitForLoad(Bundle.Big));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the bundle is reopened with its existing tracking choices'));

  // Add an embedded image.
  await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectTrackAdditions(true));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('a later source review starts with Track added pages on again'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added sunflower'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
  await sourceCommand(() => checkpoint('the later image is tracked'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
