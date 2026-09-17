/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot, sensitive } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing acceptance leaves direct-sensitive additions untracked and shows exactly the skipped pages', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  // An earlier untracked addition must not join the later skipped-page selection.
  await sourceChanges.apply('add-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.setTrackNewPages(false);
  await editor.sourceReview.accept();

  await sourceChanges.apply('add-direct-sensitive-pages');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.setTrackNewPages(true);
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive');
  }
  await addKeyFrame(sourceSnapshot);
  await snapshot('source review identifies sensitive additions before acceptance');
  await editor.sourceReview.accept();
  const notice = page.getByRole('dialog', { name: 'Tracking added pages', exact: true });
  await expect(notice.getByText('Bulk tracking did not track 2 sensitive pages.', { exact: true })).toBeVisible();
  await addKeyFrame(sensitive);
  await snapshot('curation reports which additions were not tracked');
  await notice.getByRole('button', { name: 'Show them', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await editor.switchToListView();
  await expect.poll(() => editor.getSelectedPageTitles()).toEqual(privateNames);
  await expect.poll(() => editor.getListViewPageCount()).toBe(2);
  await addKeyFrame(sensitive);
  await snapshot('only the skipped additions are selected and visible');
  // Each sensitive page was accepted but remains untracked; the safe peer was tracked.
  await editor.clickSoloSelection();
  await editor.clickSelectNone();
  for (const name of [...privateNames, 'added sunflower', 'added public update']) {
    await editor.clickListViewRowByExactName(name);
    await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect)
      .expectPill(name === 'added public update' ? Pill.Tracked : Pill.NotTracked);
    await editor.clickSelectNone();
  }
  await skipMeadowHomeStateCheck();
});
