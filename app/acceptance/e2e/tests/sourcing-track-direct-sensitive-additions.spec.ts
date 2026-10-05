/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, sensitive } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Add pages that are directly marked sensitive. Acceptance should leave them untracked and
 * name exactly which pages were skipped.
 */
test('Sourcing acceptance leaves direct-sensitive additions untracked and shows exactly the skipped pages', { annotation: { type: 'scenario-id', description: '0b132f4e-f39f-47eb-b609-dc8151afb48e' } }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted bundle is ready for new additions'));

  // --- Test start ---
  // Establish an earlier untracked addition.
  await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.setTrackNewPages(false));
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => checkpoint('an earlier addition is accepted without tracking'));

  // Add sensitive pages and a safe peer.
  await sourceCommand(() => sourceChanges.apply('add-direct-sensitive-pages'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.setTrackNewPages(true));
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await sourceCommand(() => editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive'));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('source review identifies sensitive additions before acceptance'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.sourceReview.trackingNotice.expectSensitiveSkipped(2));
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint('curation reports which additions were not tracked'));

  // Show only the skipped additions.
  await sourceCommand(() => editor.sourceReview.trackingNotice.showSkippedPages());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => expect.poll(() => editor.getSelectedPageTitles()).toEqual(privateNames));
  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(2));
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint('only the skipped additions are selected and visible'));

  // Each sensitive page was accepted but remains untracked; the safe peer was tracked.
  await sourceCommand(() => editor.clickSoloSelection());
  await sourceCommand(() => editor.clickSelectNone());
  for (const name of [...privateNames, 'added sunflower', 'added public update']) {
    await sourceCommand(() => editor.clickListViewRowByExactName(name));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect)
      .expectPill(name === 'added public update' ? Pill.Tracked : Pill.NotTracked));
    await sourceCommand(() => editor.clickSelectNone());
  }
  await sourceCommand(() => checkpoint('sensitive and earlier additions remain untracked while the safe peer is tracked'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
