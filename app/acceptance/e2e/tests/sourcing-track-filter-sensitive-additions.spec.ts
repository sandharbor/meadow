/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot, sensitive, filterSensitivity } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Enable a custom filter's Mark Sensitive action, then add matching pages without source
 * sensitivity markings. Acceptance should leave those effectively sensitive pages untracked
 * and name exactly which pages were skipped, while tracking the safe addition.
 */
test('Sourcing acceptance leaves filter-sensitive additions untracked and shows exactly the skipped pages', async ({ page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
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
  const filters = new FilterPanelComponent(page, expect);
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Confidential pages', field: 'title', matchType: 'substring', value: 'confidential', markSensitive: true });
  await checkpoint('the sensitivity filter and earlier untracked addition are ready');

  // Add pages matched by the sensitivity filter.
  await sourceChanges.apply('add-filter-sensitive-pages');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.setTrackNewPages(true);
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive via filter');
  }
  await addKeyFrame(sourceSnapshot, filterSensitivity);
  await checkpoint('source review identifies sensitive additions before acceptance');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.sourceReview.trackingNotice.expectSensitiveSkipped(2);
  await addKeyFrame(sensitive, filterSensitivity);
  await checkpoint('curation reports which additions were not tracked');

  // Show only the skipped additions.
  await editor.sourceReview.trackingNotice.showSkippedPages();
  await editor.switchToListView();
  await expect.poll(() => editor.getSelectedPageTitles()).toEqual(privateNames);
  await expect.poll(() => editor.getListViewPageCount()).toBe(2);
  await addKeyFrame(sensitive, filterSensitivity);
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
  await checkpoint('the filter-sensitive additions remain untracked while the safe peer is tracked');

  await skipMeadowHomeStateCheck();
});
