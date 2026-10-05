/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Replace an accepted image with a different picture. Compare both images in review before
 * accepting the replacement.
 */
test('Sourcing compares accepted and replacement images before accepting the new picture', { annotation: { type: 'scenario-id', description: 'ce0a8ba1-a5a2-4c97-a497-fa64407013bb' } }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Replace the image content.
  await sourceCommand(() => sourceChanges.apply('modify-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  const filename = 't006/t006 --- meadow.png';
  await sourceCommand(() => editor.sourceReview.expectModified(filename));
  await sourceCommand(() => editor.sourceReview.expandDetails(filename));
  await sourceCommand(() => editor.sourceReview.expectImageComparison(filename));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('both snapshots render their different image bytes for review'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).not.toBeVisible());
  await sourceCommand(() => checkpoint('the replacement image is accepted and a fresh scan stays clear'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
