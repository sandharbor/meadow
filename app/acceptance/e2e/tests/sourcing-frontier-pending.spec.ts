/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { frontier, frontierPendingSources, frontierDismissal, frontierLiveDiscovery } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('pending source changes hide the frontier and acknowledging the notice only disables its filter', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const filters = new FilterPanelComponent(page, expect);
  await filters.enableFilter('Frontier');
  const editor = new BundleEditorPage(page, expect);
  await editor.expectGraphNodePresent('/t016 ---- level 5.md');
  const notice = page.getByText('The frontier can’t be shown while source changes are waiting for review.', { exact: true });
  await expect(notice).not.toBeVisible();
  await addKeyFrame(frontier, frontierLiveDiscovery);
  await snapshot('live frontier exploration remains available despite orphan cleanup entries');
  await sourceChanges.apply('rename-page-with-links');
  const review = editor.sourceReview;
  await review.open();
  await review.checkAgain();
  await review.expectReadyToAccept();
  await review.defer();
  await expect(notice).toBeVisible();
  await editor.expectGraphNodeNotPresent('/t016 ---- level 5.md');
  await addKeyFrame(frontierPendingSources);
  await snapshot('pending source changes replace live frontier pages with an explanation');
  await page.getByRole('button', { name: 'Okay', exact: true }).click();
  await expect(notice).not.toBeVisible();
  await expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible();
  await addKeyFrame(frontierDismissal);
  await snapshot('acknowledging the notice leaves the source update waiting for review');
  await filters.enableFilter('Frontier');
  await expect(notice).toBeVisible();
  await skipMeadowHomeStateCheck();
});
