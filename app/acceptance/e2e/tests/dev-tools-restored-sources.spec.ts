/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { startDevTools } from '../src/run/devTools.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, checkpoint as checkpointConcept, bundleSource, startingSelection } from '../../../concepts/index.js';
import { getRuntimePaths } from '../../../runtime/supervisor/src/runtimePaths.js';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor.js';
import { postRuntimeControl, waitForRuntimeHomeRelease } from '../../../runtime/supervisor/src/runtimeClient.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source', executionSurfaces: ['dev-tools', 'browser'] });

/*
 * Restore an accepted page-and-folder collection into a new Dev Tools home.
 * Refreshing the relocated sources must leave the accepted snapshot alone;
 * a real edit after restoration must still produce a readable source review.
 */
test('Dev Tools restores accepted multi-source starts without inventing source changes', { annotation: { type: 'scenario-id', description: '2e2a6687-4377-4afb-bcfd-496e131dce69' } }, async ({ sourceCommand, page, artifactDir, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  // --- Setup ---
  // Accept a folder alongside the existing page start, then capture it.
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const sources = new SourcesControl(page, expect);
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.editStartingSelections());
  await sourceCommand(() => sources.addStartingSelection());
  await sourceCommand(() => sources.setStartingSelection(2, 'research', 'folder', 'Same'));
  await sourceCommand(() => sources.saveWithoutMaterialChanges());
  await sourceCommand(() => checkpoint('the accepted collection retains the original page and adds the folder start'));

  // --- Test start ---
  // Open the checkpoint into its own Dev Tools home and launch the web app.
  const devHomes = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-restored-sources-'));
  const devTools = await sourceCommand(() => startDevTools(expect, {
    MEADOW_HOME_DIRECTORY_OVERRIDE: path.join(devHomes, 'normal-home'),
    MEADOW_DEV_HOMES_DIRECTORY: devHomes,
    MEADOW_E2E_RUNS_DIRECTORY: path.dirname(path.dirname(artifactDir)),
  }));
  let forkHome = '';
  try {
    const opened = await sourceCommand(() => fetch(`${devTools.serverUrl}/api/saved-states/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: { kind: 'checkpoint', runId: path.basename(path.dirname(artifactDir)),
        scenario: path.basename(artifactDir), checkpoint: 1 }, serviceTarget: 'local', launch: 'browser', targetPath: '/bundle/multi-source-page' }),
    }));
    expect(opened.ok).toBe(true);
    const { state, destination } = await sourceCommand(() => opened.json()) as { state: { homeDirectory: string }; destination: string };
    forkHome = state.homeDirectory;
    const statePath = path.join(forkHome, 'bundles/multi-source-page/raw/sourcing/state.json');
    const acceptedId = (JSON.parse(fs.readFileSync(statePath, 'utf8')) as { acceptedId: string }).acceptedId;
    await sourceCommand(() => page.goto(destination));
    const forkEditor = new BundleEditorPage(page, expect);
    await sourceCommand(() => forkEditor.waitForLoad('multi-source-page'));
    await sourceCommand(() => forkEditor.waitForSourceCheck());
    const refresh = () => Promise.all([
      page.waitForResponse(response => response.url().includes('/sourcing/scan') && response.request().method() === 'POST' && response.ok()),
      page.getByTestId('sourcing-status').getByRole('button', { name: 'Refresh sources', exact: true }).click(),
    ]);
    await sourceCommand(() => refresh());
    await sourceCommand(() => expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes.*Review/i })).toHaveCount(0));
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({ acceptedId });
    expect(JSON.parse(fs.readFileSync(statePath, 'utf8')).candidateId).toBeUndefined();
    await sourceCommand(() => addKeyFrame(checkpointConcept, startingSelection));
    await sourceCommand(() => checkpoint('the restored collection has no phantom changes after refreshing sources'));

    // A real change in the fork is still discovered and explained.
    fs.appendFileSync(path.join(forkHome, 'source_graphs/multi-source/notes/Overview.md'), '\nA real edit after restoring the checkpoint.\n');
    await sourceCommand(() => refresh());
    await sourceCommand(() => forkEditor.sourceReview.open());
    await sourceCommand(() => forkEditor.sourceReview.expectModified('_mw_sources/source000001/Overview.md'));
    await sourceCommand(() => addKeyFrame(bundleSource));
    await sourceCommand(() => checkpoint('the restored collection reviews a real source edit'));
  } finally {
    await sourceCommand(() => page.goto('about:blank').catch(() => undefined));
    await sourceCommand(() => devTools.stop());
    if (forkHome) {
      const descriptorPath = getRuntimePaths(forkHome).sessionDescriptor;
      if (fs.existsSync(descriptorPath)) {
        const descriptor = readRuntimeSessionDescriptor(descriptorPath);
        await sourceCommand(() => postRuntimeControl(descriptor, '/shutdown', { force: true }));
        await sourceCommand(() => waitForRuntimeHomeRelease(descriptor));
      }
    }
    await sourceCommand(() => testInfo.attach('dev-tools-processes.log', { body: devTools.logs(), contentType: 'text/plain' }));
    fs.rmSync(devHomes, { recursive: true, force: true });
  }
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
