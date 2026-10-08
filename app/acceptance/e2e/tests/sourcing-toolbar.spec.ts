/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing toolbar checks on entry and request, briefly shows no changes, and retains the review action`);

const description = linkedScenarioDescription(conceptText`Open a bundle, request source checks, and introduce a change. The toolbar should briefly
report no changes when appropriate and retain access to pending review.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'fcb8cf0e-4985-43b0-bc5f-514b7e7211d2' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
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
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const status = page.getByTestId('sourcing-status');
  const update = status.getByRole('button', { name: 'Refresh sources', exact: true });
  const editor = new BundleEditorPage(page, expect);
  const sourceReview = editor.sourceReview;
  await sourceCommand(() => editor.expectSourceUpdateInToolbar());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('source check occupies the bundle toolbar without an extra heading row'));

  // --- Test start ---
  // Complete the initial check.
  await sourceCommand(() => page.clock.install());
  await sourceCommand(() => page.clock.pauseAt(Date.now() + 1000));
  release();
  const orphanReview = status.getByRole('button', { name: '13 source changes available – Review', exact: true });
  await sourceCommand(() => expect(orphanReview).toBeVisible());
  await sourceCommand(() => sourceReview.open());
  await sourceCommand(() => sourceReview.applyOrphanRemovals());
  await sourceCommand(() => expect(update).toBeEnabled());
  await sourceCommand(() => expect(update).toHaveText('Refresh sources'));
  const refreshBounds = await sourceCommand(() => update.boundingBox());

  gate = new Promise<void>(resolve => { release = resolve; });
  await sourceCommand(() => update.click());
  await sourceCommand(() => expect(status.getByRole('status')).toHaveText('Refreshing sources'));
  expect((await sourceCommand(() => update.boundingBox()))?.width).toBe(refreshBounds?.width);
  release();
  await sourceCommand(() => page.clock.runFor(125));
  await sourceCommand(() => expect(update.getByRole('status')).toHaveText('No changes'));
  expect((await sourceCommand(() => update.boundingBox()))?.width).toBe(refreshBounds?.width);
  await sourceCommand(() => page.clock.runFor(150));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => page.clock.runFor(2000));
  await sourceCommand(() => expect(update).toHaveText('Refresh sources'));
  expect(scans).toBe(3);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the refresh button briefly says no changes before restoring its label'));

  // Inspect the accepted history.
  const initialHistory = await sourceCommand(() => editor.reviewSourceHistory());
  await sourceCommand(() => initialHistory.expectSnapshotCount(1));
  expect(scans).toBe(3);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => initialHistory.close());
  await sourceCommand(() => checkpoint('initial history contains only the accepted checkpoint'));

  // Rename the page and its links.
  await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
  await sourceCommand(() => update.click());
  await sourceCommand(() => page.clock.runFor(125));
  const review = status.getByRole('button', { name: /source changes? available.*Review/i });
  await sourceCommand(() => expect(review).toBeVisible());
  await sourceCommand(() => page.clock.runFor(2100));
  await sourceCommand(() => expect(review).toBeVisible());
  await sourceCommand(() => sourceReview.expectClosed());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('available changes keep an explicit review action in the toolbar'));

  // Refresh again from the toolbar while changes are already waiting.
  await sourceCommand(() => sourceChanges.apply('delete-nested-page'));
  gate = new Promise<void>(resolve => { release = resolve; });
  await sourceCommand(() => expect(update).toHaveText(''));
  await sourceCommand(() => update.click());
  await sourceCommand(() => expect(update).toBeDisabled());
  await sourceCommand(() => editor.expectSourceRefreshSpinning(true));
  await sourceCommand(() => expect(review).toHaveText('2 source changes available – Review'));
  await sourceCommand(() => sourceReview.expectClosed());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  release();
  await sourceCommand(() => page.clock.runFor(125));
  await sourceCommand(() => expect(review).toHaveText('3 source changes available – Review'));
  await sourceCommand(() => expect(update).toBeEnabled());
  await sourceCommand(() => page.clock.runFor(250));
  await sourceCommand(() => editor.expectSourceRefreshSpinning(false));
  expect(scans).toBe(5);
  await sourceCommand(() => checkpoint('compact refresh discovers another change without opening review'));

  // Source review keeps the shared refresh control in its header.
  await sourceCommand(() => page.clock.resume());
  await sourceCommand(() => sourceReview.open());
  await sourceCommand(() => sourceReview.expectRefreshInHeader());
  await sourceCommand(() => sourceReview.checkAgain());
  expect(scans).toBe(5);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => sourceReview.close());
  await sourceCommand(() => checkpoint('source review keeps refresh beside its main review actions'));

  // Compare pending and accepted history.
  const pendingHistory = await sourceCommand(() => editor.reviewSourceHistory());
  await sourceCommand(() => pendingHistory.expectSnapshotCount(1));
  expect(scans).toBe(6);
  await sourceCommand(() => pendingHistory.close());
  await sourceCommand(() => sourceReview.open());
  await sourceCommand(() => sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => sourceReview.accept());
  const acceptedHistory = await sourceCommand(() => editor.reviewSourceHistory());
  await sourceCommand(() => acceptedHistory.expectSnapshotCount(2));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('accepted history lists the current checkpoint and excludes pending source changes'));

  // Open another bundle.
  await sourceCommand(() => acceptedHistory.close());
  await sourceCommand(() => page.clock.resume());
  await sourceCommand(() => new Workflows(page, expect).navigateToSmallBundle());
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible());
  await sourceCommand(() => sourceReview.expectClosed());
  await sourceCommand(() => checkpoint('opening another bundle leaves source review closed'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
