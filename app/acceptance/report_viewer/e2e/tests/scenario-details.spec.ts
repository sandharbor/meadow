/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePublishFlowArtifact } from '../fixtures/publish-flow-fixture.js';

test('scenario details play videos beside captured descriptions and keep scenario links and filters', async ({ page, request }) => {
  const fixture = ensurePublishFlowArtifact();
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-descriptions-'));
  const runId = path.basename(run);
  const description = 'Open the bundle and inspect its pages.\n\nKeep <script> text readable & preserve the captured description.';
  for (const [slug, artifact, surface] of [
    ['bundle-preview', 'report-meta.json', 'browser'],
    ['command-export', 'manifest.json', 'cli'],
    ['older-run', 'report-meta.json', 'browser'],
  ] as const) {
    const dir = path.join(run, slug);
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'status.txt'), 'passed');
    const info = { testName: slug, description: slug === 'older-run' ? undefined : description,
      executionSurface: surface, duration: 2, conceptIds: [], appAreaDocIds: [], bundleDocIds: [], keyFrames: [] };
    writeFileSync(path.join(dir, artifact), JSON.stringify(artifact === 'report-meta.json' ? { version: 1, scenarioInfo: info } : info));
    // A subsequent source edit must not change the report's captured prose.
    const spec = path.join(dir, 'edited.spec.ts');
    writeFileSync(spec, '/* A different description in the current checkout. */\ntest("changed", () => {});');
    writeFileSync(path.join(dir, 'test-file.txt'), spec);
    if (slug === 'bundle-preview') linkSync(path.join(fixture.artifactDir, 'video.webm'), path.join(dir, 'video.webm'));
  }
  try {
    const response = await request.get(`/api/runs/${runId}`);
    expect(response.ok()).toBe(true);
    const { scenarios } = await response.json() as { scenarios: { slug: string; description: string }[] };
    expect(scenarios.find(scenario => scenario.slug === 'bundle-preview')?.description).toBe(description);
    expect(scenarios.find(scenario => scenario.slug === 'command-export')?.description).toBe(description);
    await page.goto(`/${runId}`);
    const details = page.getByRole('button', { name: 'Details', exact: true });
    const videos = page.getByRole('button', { name: 'Videos', exact: true });
    expect((await videos.boundingBox())!.x).toBeLessThan((await details.boundingBox())!.x);
    await details.click();
    const detailsUrl = page.url();
    const row = page.getByRole('article', { name: 'bundle preview', exact: true });
    await expect(row).toContainText(description);
    await expect(row.getByRole('link')).toHaveAttribute('href', `/${runId}/bundle-preview`);
    const video = row.locator('video');
    await expect(video).toHaveAttribute('controls');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    const videoBox = (await video.boundingBox())!;
    const descriptionBox = (await row.getByText(description, { exact: true }).boundingBox())!;
    expect(descriptionBox.x).toBeGreaterThanOrEqual(videoBox.x + videoBox.width);
    await video.press('Space');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await expect(page).toHaveURL(detailsUrl);
    await video.press('Space');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
    await page.getByRole('slider', { name: 'Playback speed' }).press('Home');
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).playbackRate)).toBeCloseTo(0.07);
    await page.getByRole('button', { name: 'Play All', exact: true }).click();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
    await expect(page).toHaveURL(detailsUrl);
    await expect(page.getByRole('article', { name: 'older run', exact: true })).toContainText('No video available.');
    await expect(page.getByText('No description captured in this run.', { exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Interface', exact: true }).getByRole('button', { name: 'CLI', exact: true }).click();
    await expect(page.getByRole('link', { name: 'command export', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'bundle preview', exact: true })).toHaveCount(0);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play All', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('article', { name: 'command export', exact: true }).getByText(description, { exact: true })).toBeVisible();
  } finally {
    await page.goto('about:blank');
    rmSync(run, { recursive: true, force: true });
  }
});
