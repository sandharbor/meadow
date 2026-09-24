/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

/*
 * Add reachable pages and accept the source changes with the default settings. The newly
 * accepted pages should become tracked.
 */
test('Sourcing acceptance tracks new pages by default', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Add a linked page.
  await sourceChanges.apply('add-linked-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true }).getByRole('button', { name: /Discard|Cancel source/ })).toHaveCount(0);
  await editor.sourceReview.expectTrackNewPages(true);
  await addKeyFrame(sourceSnapshot);
  await snapshot('added page is selected for tracking by default');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added field notes');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked);
  await addKeyFrame(sourceSnapshot);
  await snapshot('accepted addition is already tracked in curation');

  await skipMeadowHomeStateCheck();
});
