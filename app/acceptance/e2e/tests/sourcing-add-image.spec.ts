/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

/*
 * Add a reachable image and inspect its proposed inclusion route. Acceptance should track
 * the new image without changing the accepted graph beforehand.
 */
test('Sourcing previews an added image and its inclusion route before tracking it on acceptance', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Add an embedded image.
  await sourceChanges.apply('add-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.previewImage('source-changes/added sunflower.png', ['main page.md', 't006 - embedded media.md']);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the shared added image has a thumbnail and a real inclusion route');

  // Accept the source update.
  await editor.sourceReview.accept();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('added sunflower');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked);
  await addKeyFrame(sourceSnapshot);
  await snapshot('acceptance includes and tracks the new embedded image');

  await skipMeadowHomeStateCheck();
});
