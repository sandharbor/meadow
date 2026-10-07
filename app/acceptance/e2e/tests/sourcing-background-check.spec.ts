/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { PreviewPublishModal } from '../src/run/pages/shared/PreviewPublishModal.js';
import { Workflows } from '../src/run/workflows.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing quietly checks every thirty seconds and updates the change count without replacing the toolbar button`);

const description = linkedScenarioDescription(conceptText`Change source files and let the background check discover them. The count should update
quietly while the toolbar keeps its normal review action.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '59b627f9-402c-4727-862e-678bb47b084e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => page.clock.install());
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const status = page.getByTestId('sourcing-status');
  await sourceCommand(() => expect(status.getByRole('button', { name: '13 source changes available – Review', exact: true })).toBeVisible());
  const editor = new BundleEditorPage(page, expect);
  const sourceReview = editor.sourceReview;
  await sourceCommand(() => sourceReview.open());
  await sourceCommand(() => sourceReview.applyOrphanRemovals());
  const update = status.getByRole('button', { name: 'Refresh sources', exact: true });
  await sourceCommand(() => expect(update).toBeVisible());
  await sourceCommand(() => page.clock.pauseAt(Date.now() + 1000));
  let release!: () => void;
  let gate = new Promise<void>(resolve => { release = resolve; });
  let scans = 0;
  await sourceCommand(() => page.route('**/bundles/meadow-test-bundle-big/sourcing/scan', async route => {
    scans += 1;
    const waiting = gate;
    const response = await route.fetch();
    await waiting;
    await route.fulfill({ response });
  }));

  await sourceCommand(() => checkpoint('automatic source checks are isolated and the bundle has no pending changes'));

  // --- Test start ---
  // Check automatic scanning during preview.
  await sourceCommand(() => editor.clickPreview());
  const preview = new PreviewPublishModal(page, expect);
  await sourceCommand(() => preview.waitForPreviewComplete());
  await sourceCommand(() => page.clock.fastForward(60000));
  expect(scans).toBe(0);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('automatic source checks pause while preview is open'));

  // Check automatic scanning during history review.
  await sourceCommand(() => preview.closeModal());

  const history = await sourceCommand(() => editor.reviewSourceHistory());
  await sourceCommand(() => page.clock.fastForward(60000));
  expect(scans).toBe(0);
  await sourceCommand(() => history.close());
  await sourceCommand(() => checkpoint('source history also pauses automatic checks'));

  // Let the automatic scan run.
  await sourceCommand(() => page.clock.fastForward(30000));
  await sourceCommand(() => expect(update.getByTestId('source-background-progress')).toBeVisible());
  await sourceCommand(() => editor.expectSourceRefreshSpinning(false));
  await sourceCommand(() => expect(update).toHaveText('Refresh sources'));
  await sourceCommand(() => expect(status.getByText('Refreshing sources', { exact: true })).not.toBeVisible());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  release();
  await sourceCommand(() => expect(status.getByTestId('source-background-progress')).not.toBeVisible());
  await sourceCommand(() => expect(update).toBeVisible());
  await sourceCommand(() => expect(status.getByText('No changes', { exact: true })).not.toBeVisible());
  await sourceCommand(() => checkpoint('an automatic no-change check only animates the button underline'));

  // Rename the page and its links.
  await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
  gate = new Promise<void>(resolve => { release = resolve; });
  await sourceCommand(() => page.clock.fastForward(30000));
  await sourceCommand(() => expect(update.getByTestId('source-background-progress')).toBeVisible());
  release();
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await sourceCommand(() => expect(review).toHaveText('2 source changes available – Review'));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('one move and its updated incoming link count as two source changes'));

  // Delete the nested page.
  await sourceCommand(() => sourceChanges.apply('delete-nested-page'));
  gate = new Promise<void>(resolve => { release = resolve; });
  await sourceCommand(() => page.clock.fastForward(30000));
  await sourceCommand(() => expect(review.getByTestId('source-background-progress')).toBeVisible());
  await sourceCommand(() => editor.expectSourceRefreshSpinning(false));
  await sourceCommand(() => expect(review).toHaveText('2 source changes available – Review'));
  await sourceCommand(() => expect(status.getByText('Refreshing sources', { exact: true })).not.toBeVisible());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  release();
  await sourceCommand(() => expect(review).toHaveText('3 source changes available – Review'));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('a later background check preserves the review button while updating its count'));

  // Check scanning while review is open.
  await sourceCommand(() => sourceReview.open());
  const rename = await sourceCommand(() => sourceReview.moveFrom('t003 ---- page with section to link to.md'));
  await sourceCommand(() => rename.keepSeparate());
  await sourceCommand(() => expect(sourceReview.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled());
  await sourceCommand(() => sourceChanges.apply('remove-incoming-link'));
  gate = new Promise<void>(resolve => { release = resolve; });
  await sourceCommand(() => page.clock.fastForward(60000));
  expect(scans).toBe(3);
  await sourceCommand(() => expect(status.getByTestId('source-background-progress')).not.toBeVisible());
  await sourceCommand(() => rename.expectSeparateSelected());
  await sourceCommand(() => expect(sourceReview.root.getByRole('status')).toContainText('Newer sources available'));
  await sourceCommand(() => checkpoint('source review discovers newer material without replacing the reviewed capture or its decisions'));

  // Resume manual and automatic scanning.
  release();
  await sourceCommand(() => page.clock.resume());
  await sourceCommand(() => sourceReview.checkAgain());
  expect(scans).toBe(3);
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    sourceReview.close(),
  ]));
  await sourceCommand(() => expect(update).toBeVisible());
  expect(scans).toBe(4);
  await sourceCommand(() => expect(status.getByTestId('source-background-progress')).not.toBeVisible());
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => page.clock.fastForward(30000));
  await sourceCommand(() => expect.poll(() => scans).toBe(5));
  await sourceCommand(() => expect(status.getByTestId('source-background-progress')).not.toBeVisible());
  await sourceCommand(() => page.clock.resume());
  await sourceCommand(() => checkpoint('manual rechecking and later automatic checks resume after review closes'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
