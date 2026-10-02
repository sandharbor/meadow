/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { ensurePublishFlowArtifact } from '../fixtures/publish-flow-fixture.js';

test('ticks position command markers beside multiline calls without moving code and distinguish repeated executions', async ({ page }) => {
  const base = ensurePublishFlowArtifact();
  const runDirectory = fs.mkdtempSync(path.join(os.homedir(), 'meadow-e2e-artifacts/current/rv-source-marker-'));
  const directory = path.join(runDirectory, 'source-marker');
  fs.mkdirSync(directory);
  fs.copyFileSync(path.join(base.artifactDir, 'video.webm'), path.join(directory, 'video.webm'));
  const manifestPath = path.join(directory, 'manifest.json');
  const start = Date.parse('2026-01-01T00:00:00Z');
  const source = [
    'test("source marker", async ({ sourceCommand }) => {',
    '  await sourceCommand(() => sourcing.updateSources(',
    '    "example"',
    '  ));',
    '});',
  ].join('\n');
  const manifest = { testName: 'source-marker', startTime: new Date(start).toISOString(), logs: [], testSource: source };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  try {
    await page.goto(`/${path.basename(runDirectory)}/source-marker`);
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBeGreaterThan(1);
    const duration = await video.evaluate(element => (element as HTMLVideoElement).duration);
    const ticks = [0, duration / 3, duration * 2 / 3, duration - 0.2].map((seconds, tickIndex) => ({
      timestamp: new Date(start + seconds * 1000).toISOString(), tickIndex, isCheckpoint: tickIndex === 1,
      sourceCommand: { id: tickIndex < 2 ? 0 : 1, file: 'scenario.ts', line: 2, column: 9, endLine: 4,
        text: 'sourcing.updateSources("example")', status: tickIndex % 2 ? 'completed' : 'running' },
      fileCount: 0, uncommittedCount: 0, uncommittedFiles: [], addedFiles: [], removedFiles: [],
      changedUncommitted: false, changedGitHead: false, s3KeyCount: 0,
      s3AddedKeys: [], s3ModifiedKeys: [], s3RemovedKeys: [], s3Changed: false,
    }));
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, ticks }));
    await page.reload();
    const marker = page.getByTestId('source-command-marker');
    const commandLine = page.locator('[data-source-line="2"]');
    await expect(commandLine).toContainText('await sourcing.updateSources(');
    await expect(commandLine).not.toContainText('sourceCommand');
    await page.getByRole('checkbox', { name: 'Show capture code' }).check();
    await expect(commandLine).toContainText('sourceCommand(() =>');
    await page.getByRole('checkbox', { name: 'Show capture code' }).uncheck();
    await expect(commandLine).not.toContainText('sourceCommand');
    await commandLine.click();
    await expect(marker).toHaveText('T 2CP');
    await page.keyboard.press('ArrowLeft');
    await expect(marker).toHaveAttribute('data-command-status', 'running');
    await expect(commandLine.getByTestId('source-ticks-indicator')).toHaveCount(0);
    await expect(commandLine.getByTestId('source-checkpoints-indicator')).toHaveCount(0);
    await expect(marker).toHaveAttribute('data-command-id', '0');
    await expect(marker.locator('..')).toHaveAttribute('data-source-line', '2');
    await expect(marker).toHaveText('T 1');
    await expect(commandLine).toHaveAttribute('title', /Tick 1 · running/);
    const followingLine = page.locator('[data-source-line="5"]');
    const lineOffset = await followingLine.evaluate(element => element.parentElement!.offsetTop);
    await expect(page.locator('.code-line[data-source-highlighted="true"]')).toHaveAttribute('data-source-line', '2');
    await expect(commandLine).toHaveClass(/bg-purple-50/);
    await expect(marker).toHaveClass(/text-purple-700/);
    for (const [id, status] of [['0', 'completed'], ['1', 'running'], ['1', 'completed']]) {
      await page.keyboard.press('ArrowRight');
      await expect(marker).toHaveAttribute('data-command-id', id);
      await expect(marker).toHaveAttribute('data-command-status', status);
      const checkpoint = id === '0';
      await expect(marker).toContainText(checkpoint ? 'CP' : 'T');
      await expect.poll(() => followingLine.evaluate(element => element.parentElement!.offsetTop)).toBe(lineOffset);
      await expect(commandLine).toHaveClass(checkpoint ? /bg-orange-50/ : /bg-purple-50/);
      await expect(marker).toHaveClass(checkpoint ? /text-orange-700/ : /text-purple-700/);
    }
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await page.getByRole('button', { name: 'Test Code', exact: true }).click();
    await expect(marker).toHaveAttribute('data-command-id', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(marker).toHaveAttribute('data-command-status', 'running');
  } finally {
    await page.goto('about:blank');
    fs.rmSync(runDirectory, { recursive: true, force: true });
  }
});
