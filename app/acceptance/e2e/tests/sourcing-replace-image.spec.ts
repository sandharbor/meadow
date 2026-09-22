/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('Sourcing compares accepted and replacement images before accepting the new picture', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await sourceChanges.apply('modify-embedded-image');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  const filename = 't006/t006 --- meadow.png';
  await editor.sourceReview.expectModified(filename);
  await editor.sourceReview.expandDetails(filename);
  await editor.sourceReview.expectImageComparison(filename);
  await addKeyFrame(sourceSnapshot);
  await snapshot('both snapshots render their different image bytes for review');
  await editor.sourceReview.accept();
  await editor.checkSourceChanges();
  await expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).not.toBeVisible();
  await skipMeadowHomeStateCheck();
});
