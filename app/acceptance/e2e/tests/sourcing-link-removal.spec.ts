/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceChange, orphan } from '../../../concepts/index.js';


test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

/*
 * Remove a source link and review the broken route. The accepted bundle should stay
 * unchanged until the user accepts the proposed change.
 */
test('Sourcing accepts a shared link deletion only when requested and explains its broken route', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Remove the incoming link.
  await sourceChanges.apply('remove-incoming-link');
  await editor.checkSourceChanges();
  const review = editor.sourceReview;
  const modifiedPath = 't001 - deeply nested.md';
  await review.open();
  await review.expectModified(modifiedPath);
  await review.expectNoRenames();
  await review.expandDetails(modifiedPath);
  await review.expectContentChanges(modifiedPath, {
    removed: /\[\[t001 ---- child 2\]\]/,
    added: /child 2 \(link removed\)/,
  });
  await addKeyFrame(sourceChange);
  await snapshot('link deletion is reviewed as a source edit');

  // Inspect the resulting orphan.
  await review.collapseDetails(modifiedPath);
  await review.expandDetails(modifiedPath, 'keyboard');
  await review.expectNoMissingEntry('t001/deeper/t001 ---- child 2.md');
  const orphans = await review.reviewOrphans();
  await orphans.showExplanation('t001 ---- child 2');
  await orphans.expectExplanation('t001 ---- child 2', 'no longer links to');
  await addKeyFrame(orphan);
  await snapshot('orphan details identify the removed connection before acceptance');

  // Accept the source update.
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  await editor.checkSourceChanges();
  await editor.expectSourceOrphanCount(0);
  await expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible();
  await snapshot('acceptance removes orphaned configuration and a fresh scan stays clear');

  await skipMeadowHomeStateCheck();
});
