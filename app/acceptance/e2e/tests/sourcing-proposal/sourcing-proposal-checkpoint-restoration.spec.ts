/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { startDevTools } from '../../src/run/devTools.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { getRuntimePaths } from '../../../../runtime/supervisor/src/runtimePaths.js';
import { readRuntimeSessionDescriptor } from '../../../../runtime/supervisor/src/sessionDescriptor.js';
import { postRuntimeControl, waitForRuntimeHomeRelease } from '../../../../runtime/supervisor/src/runtimeClient.js';
import { sourcingReviewRedesign, checkpointViewRestoration, sourceReviewViewState, checkpoint as checkpointConcept, appPlace, savedState } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview, executionSurfaces: ['dev-tools', 'browser'] });

/*
 * Capture separate editor views and Preview's Versions tab, then open that checkpoint in a fresh
 * Dev Tools home. Continue in the fork and capture unresolved conflict and sensitivity dialogs;
 * fork each again and prove that both modes and the actionable review are restored exactly.
 */
test('Fresh Dev Tools forks restore both mode views and exact modal tabs from checkpoints', async ({ page, testServer, sourceChanges, artifactDir, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  test.setTimeout(180000);
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const panel = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  const views = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('meadow.editor-view.v1:'))));
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('Leaf');
  await page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click();
  await panel.expandFilterGroup('Folders');
  await panel.clickAddCustomFilter();
  await panel.fillAndSaveCustomFilter({ name: 'Fork review settings', field: 'title', matchType: 'substring', value: 'Reference' });
  await sourceChanges.apply('add-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  await panel.editCustomFilter('Fork review settings');
  await panel.saveCustomFilterEdits({ note: 'Proposed fork definition' });
  await sourcing.select('Safe One');
  await sourcing.untrackSelected();
  await sourcing.trackSelected();
  await sourcing.select('Leaf');
  await sourcing.untrackSelected();
  await sourcing.clearSelection();
  await panel.enableAndSoloFilter('Added');
  await panel.clickShowTitlesOnFilter('Added');
  await sourcing.select('Safe One');
  await editor.switchToGraphView();
  await page.getByTestId('graph-canvas').hover();
  await page.mouse.wheel(0, -120);
  await sourcing.later();
  await editor.clickPreview();
  await preview.waitForPreviewCompleteAllTracked();
  await preview.clickVersionsTab();
  await expect(page).toHaveURL(/tab=versions/);
  const expectedViews = await views();
  await checkpoint('both editor views and the open Preview Versions tab are captured');

  // --- Test start ---
  const devHomes = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-review-forks-'));
  const devTools = await startDevTools(expect, {
    MEADOW_HOME_DIRECTORY_OVERRIDE: path.join(devHomes, 'normal-home'), MEADOW_DEV_HOMES_DIRECTORY: devHomes,
    MEADOW_E2E_RUNS_DIRECTORY: path.dirname(path.dirname(artifactDir)),
  });
  const forkHomes: string[] = [];
  const restore = async (index: number) => {
    const opened = await fetch(`${devTools.serverUrl}/api/saved-states/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: { kind: 'checkpoint', runId: path.basename(path.dirname(artifactDir)), scenario: path.basename(artifactDir), checkpoint: index }, serviceTarget: 'local', launch: 'browser' }),
    });
    expect(opened.ok).toBe(true);
    const { state, destination } = await opened.json() as { state: { homeDirectory: string; partition: string }; destination: string };
    expect(state.homeDirectory).not.toBe(testServer.configDir);
    expect(forkHomes).not.toContain(state.homeDirectory);
    forkHomes.push(state.homeDirectory);
    await page.goto(destination);
    return { ...state, ports: { webServer: new URL(destination).port ? Number(new URL(destination).port) : 80 } };
  };
  try {
    let target = await restore(1);
    await expect(page.getByRole('dialog', { name: 'Preview and publish', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/tab=versions/);
    await expect.poll(views).toEqual(expectedViews);
    await addKeyFrame(checkpointViewRestoration);
    await checkpoint('a fresh home restores Preview on Versions and both independent editor views', target);
    await preview.closeModal();
    await sourcing.open();
    await editor.expectGraphViewActive();
    await editor.expectLabelVisible('Safe One');
    await expect(sourcing.selectedPage.getByText('Safe One', { exact: true })).toBeVisible();
    await sourcing.later();
    await editor.expectListViewRowByExactNamePresent('Leaf');

    // Create a real curation conflict in this fork, then restore it open and unresolved.
    await panel.editCustomFilter('Fork review settings');
    await panel.saveCustomFilterEdits({ note: 'Accepted competing definition' });
    await sourcing.open();
    await sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
    await expect(conflict.getByRole('button', { name: 'Use proposed', exact: true })).toBeVisible();
    const conflictViews = await views();
    await checkpoint('configuration conflict is open and unresolved in the first fork', target);
    target = await restore(3);
    await expect(conflict).toContainText('Fork review settings');
    await expect(conflict.getByRole('button', { name: 'Use proposed', exact: true })).toBeVisible();
    await expect.poll(views).toEqual(conflictViews);
    await addKeyFrame(checkpointConcept);
    await checkpoint('a second fresh home restores the unresolved configuration choice', target);
    await conflict.getByRole('button', { name: 'Use proposed', exact: true }).click();
    await expect(conflict).toContainText('All conflicts resolved.');
    await conflict.getByRole('button', { name: 'Close', exact: true }).click();
    await sourcing.later();

    // A new accepted sensitivity rule invalidates the explicit choice without refreshing capture.
    await panel.clickAddCustomFilter();
    await panel.fillAndSaveCustomFilter({ name: 'Restored review policy', field: 'title', matchType: 'substring', value: 'Safe One', markSensitive: true });
    await sourcing.open();
    await sourcing.reviewTrackingChoices(1);
    await expect(sourcing.sensitivityReview).toContainText('Restored review policy');
    const sensitivityViews = await views();
    await checkpoint('sensitivity review is open and awaits a renewed explicit choice', target);
    target = await restore(5);
    await expect(sourcing.sensitivityReview).toContainText('Restored review policy');
    await expect(sourcing.sensitivityReview.getByRole('button', { name: 'Confirm tracking sensitive page', exact: true })).toBeEnabled();
    await expect.poll(views).toEqual(sensitivityViews);
    await addKeyFrame(sourceReviewViewState);
    await checkpoint('a third fresh home restores the exact unresolved sensitivity review', target);
    await sourcing.resolveSensitiveTracking('Safe One.md', false);
    await sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click();
    await sourcing.accept();
    await checkpoint('the restored pending choices remain actionable through acceptance', target);
  } finally {
    await page.goto('about:blank').catch(() => undefined);
    await devTools.stop();
    for (const home of forkHomes) {
      const sessionPath = getRuntimePaths(home).sessionDescriptor;
      if (fs.existsSync(sessionPath)) {
        const descriptor = readRuntimeSessionDescriptor(sessionPath);
        await postRuntimeControl(descriptor, '/shutdown', { force: true });
        await waitForRuntimeHomeRelease(descriptor);
      }
    }
    await testInfo.attach('dev-tools-processes.log', { body: devTools.logs(), contentType: 'text/plain' });
    fs.rmSync(devHomes, { recursive: true, force: true });
  }
  await skipMeadowHomeStateCheck();
});
