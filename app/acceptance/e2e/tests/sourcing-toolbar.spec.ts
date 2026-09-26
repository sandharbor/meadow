/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

/*
 * Open a bundle, request source checks, and introduce a change. The toolbar should briefly
 * report no changes when appropriate and retain access to pending review.
 */
test('Sourcing toolbar checks on entry and request, briefly shows no changes, and retains the review action', async ({ page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  let scans = 0;
  await page.route('**/bundles/meadow-test-bundle-big/sourcing/scan', async route => {
    scans += 1;
    const waiting = gate;
    const response = await route.fetch();
    await waiting;
    await route.fulfill({ response });
  });
  await new Workflows(page, expect).navigateToBigBundle();
  const status = page.getByTestId('sourcing-status');
  const update = status.getByRole('button', { name: 'Refresh sources', exact: true });
  const editor = new BundleEditorPage(page, expect);
  const sourceReview = editor.sourceReview;
  await editor.expectSourceUpdateInToolbar();
  await addKeyFrame(sourceSnapshot);
  await checkpoint('source check occupies the bundle toolbar without an extra heading row');

  // --- Test start ---
  // Complete the initial check.
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  release();
  const orphanReview = status.getByRole('button', { name: '13 source changes available – Review', exact: true });
  await expect(orphanReview).toBeVisible();
  await sourceReview.open();
  await sourceReview.applyOrphanRemovals();
  await expect(update.getByRole('status')).toHaveText('No changes');
  await page.clock.runFor(1999);
  await expect(update.getByRole('status')).toHaveText('No changes');
  await expect(update).toBeEnabled();
  await addKeyFrame(sourceSnapshot);
  await page.clock.runFor(1);
  await expect(update).toHaveText('Refresh sources');
  const refreshBounds = await update.boundingBox();

  gate = new Promise<void>(resolve => { release = resolve; });
  await update.click();
  await expect(status.getByRole('status')).toHaveText('Refreshing sources');
  expect((await update.boundingBox())?.width).toBe(refreshBounds?.width);
  release();
  await page.clock.runFor(125);
  await expect(update.getByRole('status')).toHaveText('No changes');
  expect((await update.boundingBox())?.width).toBe(refreshBounds?.width);
  await page.clock.runFor(150);
  await addKeyFrame(sourceSnapshot);
  await page.clock.runFor(2000);
  await expect(update).toHaveText('Refresh sources');
  expect(scans).toBe(2);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the refresh button briefly says no changes before restoring its label');

  // Inspect the accepted history.
  const initialHistory = await editor.reviewSourceHistory();
  await initialHistory.expectSnapshotCount(1);
  expect(scans).toBe(2);
  await addKeyFrame(sourceSnapshot);
  await initialHistory.close();
  await checkpoint('initial history contains only the accepted checkpoint');

  // Rename the page and its links.
  await sourceChanges.apply('rename-page-with-links');
  await update.click();
  await page.clock.runFor(125);
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await expect(review).toBeVisible();
  await page.clock.runFor(2100);
  await expect(review).toBeVisible();
  await sourceReview.expectClosed();
  await addKeyFrame(sourceSnapshot);
  await checkpoint('available changes keep an explicit review action in the toolbar');

  // Refresh again from the toolbar while changes are already waiting.
  await sourceChanges.apply('delete-nested-page');
  gate = new Promise<void>(resolve => { release = resolve; });
  await expect(update).toHaveText('');
  await update.click();
  await expect(update).toBeDisabled();
  await editor.expectSourceRefreshSpinning(true);
  await expect(review).toHaveText('2 source changes available – Review');
  await sourceReview.expectClosed();
  await addKeyFrame(sourceSnapshot);
  release();
  await page.clock.runFor(125);
  await expect(review).toHaveText('3 source changes available – Review');
  await expect(update).toBeEnabled();
  await page.clock.runFor(250);
  await editor.expectSourceRefreshSpinning(false);
  expect(scans).toBe(4);
  await checkpoint('compact refresh discovers another change without opening review');

  // Use the same refresh control at the top of source review.
  await page.clock.resume();
  await sourceReview.open();
  await sourceReview.expectRefreshInHeader();
  await sourceReview.checkAgain();
  expect(scans).toBe(5);
  await addKeyFrame(sourceSnapshot);
  await sourceReview.close();
  await checkpoint('source review exposes the familiar refresh icon beside its title');

  // Compare pending and accepted history.
  const pendingHistory = await editor.reviewSourceHistory();
  await pendingHistory.expectSnapshotCount(1);
  expect(scans).toBe(5);
  await pendingHistory.close();
  await sourceReview.open();
  await sourceReview.accept();
  const acceptedHistory = await editor.reviewSourceHistory();
  await acceptedHistory.expectSnapshotCount(2);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('accepted history lists the current checkpoint and excludes pending source changes');

  // Open another bundle.
  await acceptedHistory.close();
  await page.clock.resume();
  await new Workflows(page, expect).navigateToSmallBundle();
  await expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible();
  await sourceReview.expectClosed();
  await checkpoint('opening another bundle leaves source review closed');

  await skipMeadowHomeStateCheck();
});
