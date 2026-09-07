/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing quietly checks every thirty seconds and updates the change count without replacing the toolbar button', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await page.clock.install();
  await new Workflows(page, expect).navigateToBigBundle();
  const status = page.getByTestId('sourcing-status');
  await status.getByRole('button', { name: '13 source changes available – Review', exact: true }).click();
  await page.getByTestId('remove-all-orphans').click();
  await page.getByRole('button', { name: 'Apply removals', exact: true }).click();
  const update = status.getByRole('button', { name: 'Refresh sources', exact: true });
  await expect(update).toBeVisible();
  await page.clock.pauseAt(Date.now() + 1000);
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

  await page.clock.fastForward(30000);
  await expect(update.getByTestId('source-background-progress')).toBeVisible();
  await expect(update).toHaveText('Refresh sources');
  await expect(status.getByText('Refreshing sources', { exact: true })).not.toBeVisible();
  await addKeyFrame(sourceSnapshot);
  release();
  await expect(status.getByTestId('source-background-progress')).not.toBeVisible();
  await expect(update).toBeVisible();
  await expect(status.getByText('No changes', { exact: true })).not.toBeVisible();
  await snapshot('an automatic no-change check only animates the button underline');

  await sourceChanges.apply('rename-page-with-links');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(30000);
  await expect(update.getByTestId('source-background-progress')).toBeVisible();
  release();
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await expect(review).toHaveText('2 source changes available – Review');
  await addKeyFrame(sourceSnapshot);
  await snapshot('one move and its updated incoming link count as two source changes');

  await sourceChanges.apply('delete-nested-page');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(30000);
  await expect(review.getByTestId('source-background-progress')).toBeVisible();
  await expect(review).toHaveText('2 source changes available – Review');
  await expect(status.getByText('Refreshing sources', { exact: true })).not.toBeVisible();
  await addKeyFrame(sourceSnapshot);
  release();
  await expect(review).toHaveText('3 source changes available – Review');
  await addKeyFrame(sourceSnapshot);
  await snapshot('a later background check preserves the review button while updating its count');

  await review.click();
  const dialog = page.getByRole('dialog', { name: 'Source review' });
  await dialog.getByText('Details', { exact: true }).click();
  const differentPages = dialog.getByRole('radio', { name: /Different pages/ });
  await differentPages.check();
  await sourceChanges.apply('remove-incoming-link');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(30000);
  await expect(review.getByTestId('source-background-progress')).toBeVisible();
  release();
  await expect(status.getByTestId('source-background-progress')).not.toBeVisible();
  await expect(differentPages).toBeChecked();
  await expect(review).toHaveText('3 source changes available – Review');
  expect(scans).toBe(4);
  await snapshot('automatic checks preserve a candidate and its decisions while review is open');
  await page.clock.resume();
  await skipMeadowHomeStateCheck();
});
