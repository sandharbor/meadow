/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

/*
 * Open a bundle, request source checks, and introduce a change. The toolbar should briefly
 * report no changes when appropriate and retain access to pending review.
 */
test('Sourcing toolbar checks on entry and request, briefly shows no changes, and retains the review action', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
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
  await snapshot('source check occupies the bundle toolbar without an extra heading row');

  // --- Test start ---
  // Complete the initial check.
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  release();
  const orphanReview = status.getByRole('button', { name: '13 source changes available – Review', exact: true });
  await expect(orphanReview).toBeVisible();
  await sourceReview.open();
  await sourceReview.applyOrphanRemovals();
  await expect(status.getByRole('status')).toHaveText('No changes');
  await page.clock.runFor(1999);
  await expect(status.getByRole('status')).toHaveText('No changes');
  await expect(update).not.toBeVisible();
  await addKeyFrame(sourceSnapshot);
  await page.clock.runFor(1);
  await expect(update).toBeVisible();

  gate = new Promise<void>(resolve => { release = resolve; });
  await update.click();
  await expect(status.getByRole('status')).toHaveText('Refreshing sources');
  release();
  await expect(status.getByRole('status')).toHaveText('No changes');
  await page.clock.runFor(2000);
  await expect(update).toBeVisible();
  expect(scans).toBe(2);
  await addKeyFrame(sourceSnapshot);
  await snapshot('no changes becomes an update button after two seconds');

  // Inspect the accepted history.
  const initialHistory = await editor.reviewSourceHistory();
  await initialHistory.expectSnapshotCount(1);
  expect(scans).toBe(2);
  await addKeyFrame(sourceSnapshot);
  await initialHistory.close();
  await snapshot('initial history contains only the accepted snapshot');

  // Rename the page and its links.
  await sourceChanges.apply('rename-page-with-links');
  await update.click();
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await expect(review).toBeVisible();
  await page.clock.runFor(2100);
  await expect(review).toBeVisible();
  await sourceReview.expectClosed();
  await addKeyFrame(sourceSnapshot);
  await snapshot('available changes keep an explicit review action in the toolbar');

  // Compare pending and accepted history.
  const pendingHistory = await editor.reviewSourceHistory();
  await pendingHistory.expectSnapshotCount(1);
  expect(scans).toBe(3);
  await pendingHistory.close();
  await sourceReview.open();
  await sourceReview.accept();
  const acceptedHistory = await editor.reviewSourceHistory();
  await acceptedHistory.expectSnapshotCount(2);
  await addKeyFrame(sourceSnapshot);
  await snapshot('accepted history lists the current snapshot and excludes pending source changes');

  // Open another bundle.
  await acceptedHistory.close();
  await page.clock.resume();
  await new Workflows(page, expect).navigateToSmallBundle();
  await expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible();
  await sourceReview.expectClosed();
  await snapshot('opening another bundle leaves source review closed');

  await skipMeadowHomeStateCheck();
});
