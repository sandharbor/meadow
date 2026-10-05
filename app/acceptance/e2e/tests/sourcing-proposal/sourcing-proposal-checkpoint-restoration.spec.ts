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
test('Fresh Dev Tools forks restore both mode views and exact modal tabs from checkpoints', { annotation: { type: 'scenario-id', description: '852f3ce6-3489-4b5e-b396-1beb1e98f63e' } }, async ({ sourceCommand, page, testServer, sourceChanges, artifactDir, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  test.setTimeout(180000);
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const panel = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  const views = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('meadow.editor-view.v1:'))));
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('Leaf'));
  await sourceCommand(() => page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click());
  await sourceCommand(() => panel.expandFilterGroup('Folders'));
  await sourceCommand(() => panel.clickAddCustomFilter());
  await sourceCommand(() => panel.fillAndSaveCustomFilter({ name: 'Fork review settings', field: 'title', matchType: 'substring', value: 'Reference' }));
  await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => panel.editCustomFilter('Fork review settings'));
  await sourceCommand(() => panel.saveCustomFilterEdits({ note: 'Proposed fork definition' }));
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.trackSelected());
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.clearSelection());
  await sourceCommand(() => panel.enableAndSoloFilter('Added'));
  await sourceCommand(() => panel.clickShowTitlesOnFilter('Added'));
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => editor.switchToGraphView());
  await sourceCommand(() => page.getByTestId('graph-canvas').hover());
  await sourceCommand(() => page.mouse.wheel(0, -120));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => preview.clickVersionsTab());
  await sourceCommand(() => expect(page).toHaveURL(/tab=versions/));
  const expectedViews = await sourceCommand(() => views());
  await sourceCommand(() => checkpoint('both editor views and the open Preview Versions tab are captured'));

  // --- Test start ---
  const devHomes = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-review-forks-'));
  const devTools = await sourceCommand(() => startDevTools(expect, {
    MEADOW_HOME_DIRECTORY_OVERRIDE: path.join(devHomes, 'normal-home'), MEADOW_DEV_HOMES_DIRECTORY: devHomes,
    MEADOW_E2E_RUNS_DIRECTORY: path.dirname(path.dirname(artifactDir)),
  }));
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
    let target = await sourceCommand(() => restore(1));
    await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Preview and publish', exact: true })).toBeVisible());
    await sourceCommand(() => expect(page).toHaveURL(/tab=versions/));
    await sourceCommand(() => expect.poll(views).toEqual(expectedViews));
    await sourceCommand(() => addKeyFrame(checkpointViewRestoration));
    await sourceCommand(() => checkpoint('a fresh home restores Preview on Versions and both independent editor views', target));
    await sourceCommand(() => preview.closeModal());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => editor.expectGraphViewActive());
    await sourceCommand(() => editor.expectLabelVisible('Safe One'));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Safe One', { exact: true })).toBeVisible());
    await sourceCommand(() => sourcing.later());
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Leaf'));

    // Create a real curation conflict in this fork, then restore it open and unresolved.
    await sourceCommand(() => panel.editCustomFilter('Fork review settings'));
    await sourceCommand(() => panel.saveCustomFilterEdits({ note: 'Accepted competing definition' }));
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click());
    const conflict = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
    await sourceCommand(() => expect(conflict.getByRole('button', { name: 'Use proposed', exact: true })).toBeVisible());
    const conflictViews = await sourceCommand(() => views());
    await sourceCommand(() => checkpoint('configuration conflict is open and unresolved in the first fork', target));
    target = await sourceCommand(() => restore(3));
    await sourceCommand(() => expect(conflict).toContainText('Fork review settings'));
    await sourceCommand(() => expect(conflict.getByRole('button', { name: 'Use proposed', exact: true })).toBeVisible());
    await sourceCommand(() => expect.poll(views).toEqual(conflictViews));
    await sourceCommand(() => addKeyFrame(checkpointConcept));
    await sourceCommand(() => checkpoint('a second fresh home restores the unresolved configuration choice', target));
    await sourceCommand(() => conflict.getByRole('button', { name: 'Use proposed', exact: true }).click());
    await sourceCommand(() => expect(conflict).toContainText('All conflicts resolved.'));
    await sourceCommand(() => conflict.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => sourcing.later());

    // A new accepted sensitivity rule invalidates the explicit choice without refreshing capture.
    await sourceCommand(() => panel.clickAddCustomFilter());
    await sourceCommand(() => panel.fillAndSaveCustomFilter({ name: 'Restored review policy', field: 'title', matchType: 'substring', value: 'Safe One', markSensitive: true }));
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.reviewTrackingChoices(1));
    await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('Restored review policy'));
    const sensitivityViews = await sourceCommand(() => views());
    await sourceCommand(() => checkpoint('sensitivity review is open and awaits a renewed explicit choice', target));
    target = await sourceCommand(() => restore(5));
    await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('Restored review policy'));
    await sourceCommand(() => expect(sourcing.sensitivityReview.getByRole('button', { name: 'Confirm tracking sensitive page', exact: true })).toBeEnabled());
    await sourceCommand(() => expect.poll(views).toEqual(sensitivityViews));
    await sourceCommand(() => addKeyFrame(sourceReviewViewState));
    await sourceCommand(() => checkpoint('a third fresh home restores the exact unresolved sensitivity review', target));
    await sourceCommand(() => sourcing.resolveSensitiveTracking('Safe One.md', false));
    await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => sourcing.accept());
    await sourceCommand(() => checkpoint('the restored pending choices remain actionable through acceptance', target));
  } finally {
    await sourceCommand(() => page.goto('about:blank').catch(() => undefined));
    await sourceCommand(() => devTools.stop());
    for (const home of forkHomes) {
      const sessionPath = getRuntimePaths(home).sessionDescriptor;
      if (fs.existsSync(sessionPath)) {
        const descriptor = readRuntimeSessionDescriptor(sessionPath);
        await sourceCommand(() => postRuntimeControl(descriptor, '/shutdown', { force: true }));
        await sourceCommand(() => waitForRuntimeHomeRelease(descriptor));
      }
    }
    await sourceCommand(() => testInfo.attach('dev-tools-processes.log', { body: devTools.logs(), contentType: 'text/plain' }));
    fs.rmSync(devHomes, { recursive: true, force: true });
  }
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
