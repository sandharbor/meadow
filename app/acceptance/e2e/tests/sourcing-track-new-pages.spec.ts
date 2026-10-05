/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Add reachable pages and accept the source changes with the default settings. The newly
 * accepted pages should become tracked.
 */
test('Sourcing acceptance tracks new pages by default', { annotation: { type: 'scenario-id', description: '7437de34-d543-4c52-950b-c3d7c192ee15' } }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Add a linked page.
  await sourceCommand(() => sourceChanges.apply('add-linked-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => expect(page.getByTestId('sourcing-workspace').getByRole('button', { name: 'Discard proposal', exact: true })).toBeVisible());
  await sourceCommand(() => editor.sourceReview.expectTrackNewPages(true));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('added page is selected for tracking by default'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added field notes'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('accepted addition is already tracked in curation'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
