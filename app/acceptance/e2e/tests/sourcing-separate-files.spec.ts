/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan } from '../../../concepts/index.js';

const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

/*
 * Reject a proposed rename by keeping the old and new files separate. Acceptance should
 * remove the old configuration instead of transferring its identity.
 */
test('Sourcing treats a rejected rename as different pages and removes the old configuration on acceptance', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Rename the page and its links.
  await sourceChanges.apply('rename-page-with-links');
  await editor.checkSourceChanges();
  const review = editor.sourceReview;
  await review.open();
  const rename = await review.moveFrom(`${originalTitle}.md`);
  await rename.expandDetails();
  await rename.keepSeparate();
  await rename.expectPreviousRoute('t003 - link to section.md');
  await addKeyFrame(orphan);
  await snapshot('different pages shows the previous route and proposes removing the old configuration');

  // Accept the source update.
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  await expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible();
  await snapshot('acceptance removes the old identity after rejecting the rename');

  await skipMeadowHomeStateCheck();
});
