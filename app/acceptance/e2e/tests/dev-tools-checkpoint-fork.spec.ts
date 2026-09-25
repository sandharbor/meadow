/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { startDevTools } from '../src/run/devTools.js';
import { DevSavedStatesPage } from '../src/run/pages/dev-tools/SavedStatesPage.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { checkpoint as checkpointConcept, localServices, serviceTarget } from '../../../concepts/index.js';
import { minioBucketName } from '../../../tooling/local_services/src/index.js';
import { MinioS3 } from '../src/run/utils/MinioS3.js';
import { getRuntimePaths } from '../../../runtime/supervisor/src/runtimePaths.js';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor.js';
import { postRuntimeControl, waitForRuntimeHomeRelease } from '../../../runtime/supervisor/src/runtimeClient.js';

test.use({ bundleMode: 'single-file' });

async function stopRuntime(home: string): Promise<void> {
  const sessionPath = getRuntimePaths(home).sessionDescriptor;
  if (!fs.existsSync(sessionPath)) return;
  const descriptor = readRuntimeSessionDescriptor(sessionPath);
  await postRuntimeControl(descriptor, '/shutdown', { force: true });
  await waitForRuntimeHomeRelease(descriptor);
}

/*
 * Fork this scenario at its own checkpoint. After a source move and a published
 * object, the checkpoint is opened in Dev Tools the way the report viewer opens
 * it: the whole home and its object storage are restored into a fresh home and
 * partition, Hosted Development is refused because local storage holds state,
 * and the forked app shows the same pending move on current code.
 */
test('Dev Tools forks a scenario checkpoint into a fresh home with Local services', async ({ page, testServer, sourceChanges, minioS3, artifactDir, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  await new BundleEditorPage(page, expect).waitForSourceCheck();
  await sourceChanges.apply('move-nested-page');
  await minioS3.putObjectContent('bundles/forked/index.html', '<h1>Published before the checkpoint</h1>', 'text/html');
  await checkpoint('a pending move and a published page exist before the fork');

  // --- Test start ---
  // Open the checkpoint in Dev Tools the way the report viewer does.
  const runsDirectory = path.dirname(path.dirname(artifactDir));
  const runId = path.basename(path.dirname(artifactDir));
  const scenario = path.basename(artifactDir);
  const devHomes = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-dev-homes-'));
  const devTools = await startDevTools(expect, {
    MEADOW_HOME_DIRECTORY_OVERRIDE: path.join(devHomes, 'normal-home'),
    MEADOW_DEV_HOMES_DIRECTORY: devHomes,
    MEADOW_E2E_RUNS_DIRECTORY: runsDirectory,
    MEADOW_REPORT_VIEWER_URL: 'http://localhost:5175',
  });
  let forkHome = '';
  try {
    const options = await (await fetch(`${devTools.serverUrl}/api/checkpoints/${runId}/${scenario}`)).json() as {
      checkpoints: { index: number; message: string; openable: boolean; hostedAvailable: boolean; hostedUnavailableReason?: string }[];
    };
    expect(options.checkpoints).toHaveLength(1);
    expect(options.checkpoints[0]).toMatchObject({ index: 1, message: 'a pending move and a published page exist before the fork', openable: true, hostedAvailable: false });
    expect(options.checkpoints[0].hostedUnavailableReason).toContain('Object storage (MinIO)');
    const refused = await fetch(`${devTools.serverUrl}/api/saved-states/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: { kind: 'checkpoint', runId, scenario, checkpoint: 1 }, serviceTarget: 'hosted', launch: 'none' }),
    });
    expect(refused.status).toBe(409);
    expect((await refused.json() as { error: string }).error).toContain('a hosted backend could not resolve it');
    const opened = await fetch(`${devTools.serverUrl}/api/saved-states/open`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: { kind: 'checkpoint', runId, scenario, checkpoint: 1 }, serviceTarget: 'local', launch: 'browser', targetPath: '/bundle/meadow-test-bundle-big?surface=source-review' }),
    });
    expect(opened.ok).toBe(true);
    const { state, destination } = await opened.json() as { state: { homeDirectory: string; partition: string }; destination: string };
    forkHome = state.homeDirectory;
    expect(forkHome).not.toBe(testServer.configDir);
    await addKeyFrame(serviceTarget);
    await checkpoint('Dev Tools opened the checkpoint with Local services and refused Hosted Development');

    // Check what the fork restored.
    await page.goto(devTools.clientUrl);
    await new DevSavedStatesPage(page, expect).expectOpen({
      origin: 'Checkpoint 1 of an E2E run',
      services: /^Local · partition dev-/,
      checkpoint: 'a pending move and a published page exist before the fork',
      code: /^Run at [0-9a-f]{7}( \(\+uncommitted\))?; you're at [0-9a-f]{7}( \(\+uncommitted\))?$/,
    });
    await addKeyFrame(checkpointConcept);
    expect(fs.existsSync(path.join(forkHome, 'source_graphs/meadow-test-bundles-data/source-changes/moved/t001 ---- child 2.md'))).toBe(true);
    const forkStorage = new MinioS3(testServer.localServices.containers.minio.endpoint, minioBucketName(state.partition), expect);
    try {
      expect(await forkStorage.getObjectContent('bundles/forked/index.html')).toBe('<h1>Published before the checkpoint</h1>');
    } finally {
      forkStorage.destroy();
    }
    await addKeyFrame(localServices);
    await checkpoint('the fork holds the captured home and object storage');

    // Review the move in the forked application.
    await page.goto(destination);
    const review = new BundleEditorPage(page, expect).sourceReview;
    await expect(page.getByRole('dialog', { name: 'Source changes', exact: true })).toBeVisible();
    await review.open();
    // The move happened after the scenario's last source check, exactly as in
    // the captured home, so the fork discovers it on its first check.
    await review.checkAgain();
    await review.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md');
    await addKeyFrame(checkpointConcept);
    await checkpoint('the forked application reviews the same pending move');
  } finally {
    await page.goto('about:blank').catch(() => undefined);
    await devTools.stop();
    if (forkHome) await stopRuntime(forkHome).catch(() => undefined);
    await testInfo.attach('dev-tools-processes.log', { body: devTools.logs(), contentType: 'text/plain' });
    fs.rmSync(devHomes, { recursive: true, force: true });
  }
  await skipMeadowHomeStateCheck();
});
