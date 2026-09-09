/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { PreviewPublishModal } from '../src/run/pages/BundleEditorPage/components/PreviewPublishModal/PreviewPublishModal.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing quietly checks every thirty seconds and updates the change count without replacing the toolbar button', async ({ page, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await page.clock.install();
  await new Workflows(page, expect).navigateToBigBundle();
  const status = page.getByTestId('sourcing-status');
  await expect(status.getByRole('button', { name: '13 source changes available – Review', exact: true })).toBeVisible();
  const editor = new BundleEditorPage(page, expect);
  const sourceReview = editor.sourceReview;
  await sourceReview.open();
  await sourceReview.applyOrphanRemovals();
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

  await editor.clickPreview();
  const preview = new PreviewPublishModal(page, expect);
  await preview.waitForPreviewComplete();
  await page.clock.fastForward(60000);
  expect(scans).toBe(0);
  await addKeyFrame(sourceSnapshot);
  await snapshot('automatic source checks pause while preview is open');
  await preview.closeModal();

  const history = await editor.reviewSourceHistory();
  await page.clock.fastForward(60000);
  expect(scans).toBe(0);
  await history.close();

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

  await sourceReview.open();
  const rename = await sourceReview.moveFrom('t003 ---- page with section to link to.md');
  await rename.expandDetails();
  await rename.keepSeparate();
  await sourceChanges.apply('remove-incoming-link');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.clock.fastForward(60000);
  expect(scans).toBe(3);
  await expect(status.getByTestId('source-background-progress')).not.toBeVisible();
  await rename.expectSeparateSelected();
  await expect(review).toHaveText('3 source changes available – Review');
  await snapshot('source review pauses automatic checks and preserves its decisions');
  release();
  await sourceReview.checkAgain();
  expect(scans).toBe(4);
  await sourceReview.close();
  await page.clock.fastForward(30000);
  await expect.poll(() => scans).toBe(5);
  await expect(status.getByTestId('source-background-progress')).not.toBeVisible();
  await page.clock.resume();
  await skipMeadowHomeStateCheck();
});
