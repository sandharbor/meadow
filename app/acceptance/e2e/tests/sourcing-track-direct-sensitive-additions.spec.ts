/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot, sensitive } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Add pages that are directly marked sensitive. Acceptance should leave them untracked and
 * name exactly which pages were skipped.
 */
test('Sourcing acceptance leaves direct-sensitive additions untracked and shows exactly the skipped pages', async ({ page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await checkpoint('the accepted bundle is ready for new additions');

  // --- Test start ---
  // Establish an earlier untracked addition.
  await sourceChanges.apply('add-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.setTrackNewPages(false);
  await editor.sourceReview.accept();
  await checkpoint('an earlier addition is accepted without tracking');

  // Add sensitive pages and a safe peer.
  await sourceChanges.apply('add-direct-sensitive-pages');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.setTrackNewPages(true);
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive');
  }
  await addKeyFrame(sourceSnapshot);
  await checkpoint('source review identifies sensitive additions before acceptance');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.sourceReview.trackingNotice.expectSensitiveSkipped(2);
  await addKeyFrame(sensitive);
  await checkpoint('curation reports which additions were not tracked');

  // Show only the skipped additions.
  await editor.sourceReview.trackingNotice.showSkippedPages();
  await editor.switchToListView();
  await expect.poll(() => editor.getSelectedPageTitles()).toEqual(privateNames);
  await expect.poll(() => editor.getListViewPageCount()).toBe(2);
  await addKeyFrame(sensitive);
  await checkpoint('only the skipped additions are selected and visible');

  // Each sensitive page was accepted but remains untracked; the safe peer was tracked.
  await editor.clickSoloSelection();
  await editor.clickSelectNone();
  for (const name of [...privateNames, 'added sunflower', 'added public update']) {
    await editor.clickListViewRowByExactName(name);
    await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect)
      .expectPill(name === 'added public update' ? Pill.Tracked : Pill.NotTracked);
    await editor.clickSelectNone();
  }
  await checkpoint('sensitive and earlier additions remain untracked while the safe peer is tracked');

  await skipMeadowHomeStateCheck();
});
