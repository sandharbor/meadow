/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, frontier, frontierPendingSources, frontierDismissal, frontierLiveDiscovery } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/* Frontier discovery uses the reviewed core capture. Newer source links remain unavailable until an explicit update. */
test('newer source changes pause sourcing frontier discovery until the reviewed capture is updated', { annotation: { type: 'scenario-id', description: '334554e6-7b1c-4ae2-bcc1-3710e807b936' } }, async ({ sourceCommand, page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => review.open());
  await sourceCommand(() => filters.enableFilter('Frontier'));
  await sourceCommand(() => editor.expectGraphNodePresent('file:t016 ---- level 5.md'));
  await sourceCommand(() => addKeyFrame(frontier, frontierLiveDiscovery));
  await sourceCommand(() => checkpoint('frontier exploration uses the current reviewed capture'));

  // --- Test start ---
  await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
  await sourceCommand(() => filters.setFilterThresholdValue('Frontier', 2));
  const notice = page.getByText('Update sources to explore the frontier of the newer material. Your reviewed capture has been kept.', { exact: true });
  await sourceCommand(() => expect(notice).toBeVisible());
  await sourceCommand(() => editor.expectGraphNodeNotPresent('file:t016 ---- level 5.md'));
  await sourceCommand(() => addKeyFrame(frontierPendingSources));
  await sourceCommand(() => checkpoint('newer live links cannot be combined with the existing capture'));
  await sourceCommand(() => filters.disableFilter('Frontier'));
  await sourceCommand(() => expect(notice).not.toBeVisible());
  await sourceCommand(() => addKeyFrame(frontierDismissal));
  await sourceCommand(() => checkpoint('disabling exploration preserves the pending capture'));
  await sourceCommand(() => review.checkAgain());
  await sourceCommand(() => review.confirmSuggestedIdentities());
  await sourceCommand(() => review.continueToGraph());
  await sourceCommand(() => filters.enableFilter('Frontier'));
  await sourceCommand(() => editor.expectGraphNodePresent('file:t016 ---- level 5.md'));
  await sourceCommand(() => expect(notice).not.toBeVisible());
  await sourceCommand(() => checkpoint('explicit capture and identity confirmation restore frontier exploration'));
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
