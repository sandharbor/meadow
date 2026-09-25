/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { frontier, frontierPendingSources, frontierDismissal, frontierLiveDiscovery } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Leave source changes awaiting review and inspect the frontier notice. The frontier
 * should stay hidden; acknowledging the notice should only turn off its filter.
 */
test('pending source changes hide the frontier and acknowledging the notice only disables its filter', async ({ page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const filters = new FilterPanelComponent(page, expect);
  await filters.enableFilter('Frontier');
  const editor = new BundleEditorPage(page, expect);
  await editor.expectGraphNodePresent('/t016 ---- level 5.md');
  const notice = page.getByText('The frontier can’t be shown while source changes are waiting for review.', { exact: true });
  await expect(notice).not.toBeVisible();
  await addKeyFrame(frontier, frontierLiveDiscovery);
  await checkpoint('live frontier exploration remains available despite orphan cleanup entries');

  // --- Test start ---
  // Rename the page and its links.
  await sourceChanges.apply('rename-page-with-links');
  const review = editor.sourceReview;
  await review.open();
  await review.checkAgain();
  await review.expectReadyToAccept();
  await review.defer();
  await expect(notice).toBeVisible();
  await editor.expectGraphNodeNotPresent('/t016 ---- level 5.md');
  await addKeyFrame(frontierPendingSources);
  await checkpoint('pending source changes replace live frontier pages with an explanation');

  // Acknowledge the frontier notice.
  await page.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible();
  await addKeyFrame(frontierDismissal);
  await checkpoint('acknowledging the notice leaves the source update waiting for review');

  // Try frontier exploration again.
  await filters.enableFilter('Frontier');
  await expect(notice).toBeVisible();
  await checkpoint('reopening the frontier reminds the user that source review is still pending');

  await skipMeadowHomeStateCheck();
});
