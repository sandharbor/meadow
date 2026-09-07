/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing toolbar checks on entry and request, briefly shows no changes, and retains the review action', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
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
  const update = status.getByRole('button', { name: 'Update sources', exact: true });
  await new BundleEditorPage(page, expect).expectSourceUpdateInToolbar();
  await addKeyFrame(sourceSnapshot);
  await snapshot('source check occupies the bundle toolbar without an extra heading row');

  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  release();
  const orphanReview = status.getByRole('button', { name: '13 source changes available – Review', exact: true });
  await expect(orphanReview).toBeVisible();
  await orphanReview.click();
  await page.getByTestId('remove-all-orphans').click();
  await page.getByRole('button', { name: 'Apply removals', exact: true }).click();
  await expect(status.getByRole('status')).toHaveText('No changes');
  await page.clock.runFor(1999);
  await expect(status.getByRole('status')).toHaveText('No changes');
  await expect(update).not.toBeVisible();
  await addKeyFrame(sourceSnapshot);
  await page.clock.runFor(1);
  await expect(update).toBeVisible();

  gate = new Promise<void>(resolve => { release = resolve; });
  await update.click();
  await expect(status.getByRole('status')).toHaveText('Updating sources');
  release();
  await expect(status.getByRole('status')).toHaveText('No changes');
  await page.clock.runFor(2000);
  await expect(update).toBeVisible();
  expect(scans).toBe(2);
  await addKeyFrame(sourceSnapshot);
  await snapshot('no changes becomes an update button after two seconds');

  await page.getByTitle('Bundle options', { exact: true }).click();
  await page.getByRole('button', { name: 'Source snapshots', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Source review' })).toContainText('Snapshot details and history');
  await page.getByRole('button', { name: 'Close source review' }).click();

  await sourceChanges.apply('rename-page-with-links');
  await update.click();
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await expect(review).toBeVisible();
  await page.clock.runFor(2100);
  await expect(review).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Source review' })).not.toBeVisible();
  await addKeyFrame(sourceSnapshot);
  await snapshot('available changes keep an explicit review action in the toolbar');
  await page.clock.resume();
  await new Workflows(page, expect).navigateToSmallBundle();
  await expect(page.getByRole('button', { name: 'Update sources', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Source review' })).not.toBeVisible();
  await skipMeadowHomeStateCheck();
});
