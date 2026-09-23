/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensurePublishFlowArtifact } from '../fixtures/publish-flow-fixture.js';

test('arrow navigation highlights snapshot calls in both directions and after reopening Test Code', async ({ page }) => {
  const base = ensurePublishFlowArtifact();
  const runDirectory = fs.mkdtempSync(path.join(os.homedir(), 'meadow-e2e-artifacts/current/rv-snapshot-lines-'));
  const directory = path.join(runDirectory, 'snapshot-code');
  fs.mkdirSync(directory);
  fs.copyFileSync(path.join(base.artifactDir, 'video.webm'), path.join(directory, 'video.webm'));
  const manifestPath = path.join(directory, 'manifest.json');
  const start = Date.parse('2026-01-01T00:00:00Z');
  const source = [
    'test("snapshot code", async ({ snapshot }) => {',
    "  await snapshot('setup complete');",
    '',
    '  // Review the choices.',
    '  await snapshot("review ready");',
    '',
    '  // Accept the update.',
    '  await snapshot(`accepted`);',
    '});',
  ].join('\n');
  const manifest = { testName: 'snapshot-code', startTime: new Date(start).toISOString(), logs: [], testSource: source };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    await page.goto(`/${path.basename(runDirectory)}/snapshot-code`);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);
    const duration = await video.evaluate(element => (element as HTMLVideoElement).duration);
    expect(Number.isFinite(duration)).toBe(true);
    const ticks = [0, duration / 2, duration - 0.4, duration - 0.2].map((seconds, tickIndex) => ({
      timestamp: new Date(start + seconds * 1000).toISOString(), tickIndex,
      isSnapshot: tickIndex > 0,
      snapshotMessage: ['', 'setup complete', 'review ready', 'accepted'][tickIndex],
      fileCount: 0, uncommittedCount: 0, uncommittedFiles: [], addedFiles: [], removedFiles: [],
      changedUncommitted: false, changedGitHead: false, s3KeyCount: 0,
      s3AddedKeys: [], s3ModifiedKeys: [], s3RemovedKeys: [], s3Changed: false,
    }));
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, ticks }));
    await page.reload();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);
    const selectedLine = page.locator('.code-line.bg-orange-100');
    await expect(selectedLine).toHaveAttribute('data-source-line', '1');
    for (const line of [2, 5, 8]) {
      await page.keyboard.press('ArrowRight');
      await expect(selectedLine).toHaveAttribute('data-source-line', String(line));
    }
    await expect.poll(() => video.evaluate(element => {
      const media = element as HTMLVideoElement;
      return media.duration - media.currentTime;
    })).toBeLessThan(1);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Test Code', exact: true }).click();
    await expect(selectedLine).toHaveAttribute('data-source-line', '8');
    for (const line of [5, 2, 1]) {
      await page.keyboard.press('ArrowLeft');
      await expect(selectedLine).toHaveAttribute('data-source-line', String(line));
    }
  } finally {
    await page.goto('about:blank');
    fs.rmSync(runDirectory, { recursive: true, force: true });
  }
});
