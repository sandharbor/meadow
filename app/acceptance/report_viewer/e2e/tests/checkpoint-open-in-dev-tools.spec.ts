/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensurePublishFlowArtifact } from '../fixtures/publish-flow-fixture.js';

// Dev Tools is a separate app; the viewer only speaks its HTTP contract, so
// the test stands in for it at a fake origin.
const DEV_TOOLS = 'http://dev-tools.test';

test('a checkpoint opens in Dev Tools with Local, and Hosted Development explains why it cannot', async ({ page }) => {
  const base = ensurePublishFlowArtifact();
  const runDirectory = fs.mkdtempSync(path.join(os.homedir(), 'meadow-e2e-artifacts/current/rv-checkpoint-open-'));
  const runId = path.basename(runDirectory);
  const directory = path.join(runDirectory, 'checkpoint-open');
  fs.mkdirSync(directory);
  fs.copyFileSync(path.join(base.artifactDir, 'video.webm'), path.join(directory, 'video.webm'));
  const start = Date.parse('2026-01-01T00:00:00Z');
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = {
    testName: 'checkpoint-open',
    startTime: new Date(start).toISOString(),
    logs: [],
    testSource: 'test("checkpoint open", async ({ checkpoint }) => {\n  await checkpoint("setup complete");\n  await checkpoint("published");\n});',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const opened: unknown[] = [];
  await page.route('**/api/dev-tools', route => route.fulfill({ json: { url: DEV_TOOLS } }));
  await page.route(`${DEV_TOOLS}/api/checkpoints/**`, route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    json: {
      checkpoints: [
        { index: 1, message: 'setup complete', openable: true, hostedAvailable: true },
        {
          index: 2, message: 'published', openable: true, hostedAvailable: false, placeDescription: 'big › Preview › share › publish',
          hostedUnavailableReason: 'This checkpoint holds state in local Object storage (MinIO), such as published content or a signed-in account; a hosted backend could not resolve it.',
        },
      ],
    },
  }));
  await page.route(`${DEV_TOOLS}/api/saved-states/open`, async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
      return;
    }
    opened.push(route.request().postDataJSON());
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { success: true } });
  });
  try {
    await page.goto(`/${runId}/checkpoint-open`);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);
    const duration = await video.evaluate(element => (element as HTMLVideoElement).duration);
    const ticks = [0, duration / 2, duration - 0.3].map((seconds, tickIndex) => ({
      timestamp: new Date(start + seconds * 1000).toISOString(), tickIndex,
      isCheckpoint: tickIndex > 0,
      checkpointMessage: ['', 'setup complete', 'published'][tickIndex],
      fileCount: 0, uncommittedCount: 0, uncommittedFiles: [], addedFiles: [], removedFiles: [],
      changedUncommitted: false, changedGitHead: false, s3KeyCount: 0,
      s3AddedKeys: [], s3ModifiedKeys: [], s3RemovedKeys: [], s3Changed: false,
    }));
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, ticks }));
    await page.reload();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);

    // The second checkpoint published content, so only Local can open it.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const control = page.getByTestId('checkpoint-open-control');
    const openButton = control.getByRole('button', { name: 'Open checkpoint 2 in Dev Tools with Local' });
    await expect(openButton).toBeEnabled();
    await expect(openButton).toHaveText('Open dev');
    await expect(openButton).toHaveAttribute('title', 'Opens at big › Preview › share › publish');
    await expect(control).not.toContainText('big › Preview › share › publish');
    await control.getByRole('button', { name: 'More ways to open checkpoint 2' }).click();
    const hosted = control.getByRole('menuitem', { name: /^Hosted Development/ });
    await expect(hosted).toBeDisabled();
    await expect(hosted).toContainText('a hosted backend could not resolve it');
    await control.getByRole('menuitem', { name: /^Local/ }).click();
    await expect(control.getByRole('status')).toHaveText('Opened in Dev Tools with Local');
    expect(opened).toEqual([{ origin: { kind: 'checkpoint', runId, scenario: 'checkpoint-open', checkpoint: 2 }, serviceTarget: 'local', launch: 'app' }]);

    // The first checkpoint held no service state, so Hosted Development works too.
    await page.keyboard.press('ArrowLeft');
    await control.getByRole('button', { name: 'More ways to open checkpoint 1' }).click();
    await control.getByRole('menuitem', { name: /^Hosted Development/ }).click();
    await expect(control.getByRole('status')).toHaveText('Opened in Dev Tools with Hosted Development');
    expect(opened.at(-1)).toMatchObject({ origin: { checkpoint: 1 }, serviceTarget: 'hosted' });
  } finally {
    await page.goto('about:blank');
    fs.rmSync(runDirectory, { recursive: true, force: true });
  }
});
