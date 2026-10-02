/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, frontier, frontierPendingSources, frontierDismissal, frontierLiveDiscovery } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/* Frontier discovery uses the reviewed core capture. Newer source links remain unavailable until an explicit update. */
test('newer source changes pause sourcing frontier discovery until the reviewed capture is updated', async ({ page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  const filters = new FilterPanelComponent(page, expect);
  await review.open();
  await filters.enableFilter('Frontier');
  await editor.expectGraphNodePresent('file:t016 ---- level 5.md');
  await addKeyFrame(frontier, frontierLiveDiscovery);
  await checkpoint('frontier exploration uses the current reviewed capture');

  // --- Test start ---
  await sourceChanges.apply('rename-page-with-links');
  await filters.setFilterThresholdValue('Frontier', 2);
  const notice = page.getByText('Update sources to explore the frontier of the newer material. Your reviewed capture has been kept.', { exact: true });
  await expect(notice).toBeVisible();
  await editor.expectGraphNodeNotPresent('file:t016 ---- level 5.md');
  await addKeyFrame(frontierPendingSources);
  await checkpoint('newer live links cannot be combined with the existing capture');
  await filters.disableFilter('Frontier');
  await expect(notice).not.toBeVisible();
  await addKeyFrame(frontierDismissal);
  await checkpoint('disabling exploration preserves the pending capture');
  await review.checkAgain();
  await review.confirmSuggestedIdentities();
  await review.continueToGraph();
  await filters.enableFilter('Frontier');
  await editor.expectGraphNodePresent('file:t016 ---- level 5.md');
  await expect(notice).not.toBeVisible();
  await checkpoint('explicit capture and identity confirmation restore frontier exploration');
  await skipMeadowHomeStateCheck();
});
