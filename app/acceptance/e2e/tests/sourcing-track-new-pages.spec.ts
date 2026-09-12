/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing acceptance tracks new pages by default', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await sourceChanges.apply('add-linked-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectTrackNewPages(true);
  await addKeyFrame(sourceSnapshot);
  await snapshot('added page is selected for tracking by default');
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added field notes');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked);
  await addKeyFrame(sourceSnapshot);
  await snapshot('accepted addition is already tracked in curation');
  await skipMeadowHomeStateCheck();
});
