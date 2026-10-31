/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conceptText, conceptLink, orphan, treatAsDifferentPages } from '../../../../concepts/index.js';

for (const width of [1280, 390]) {
  test(`checkpoint prose retains linked concepts, associated images, and original code at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
    mkdirSync(root, { recursive: true });
    const run = mkdtempSync(path.join(root, 'rv-checkpoint-prose-'));
    const dir = path.join(run, 'checkpoint-prose');
    mkdirSync(dir);
    await page.setContent('<body style="margin:0;background:#e0f2fe;font:24px sans-serif"><main style="padding:48px">Review different pages and orphaned configuration</main></body>');
    await page.screenshot({ path: path.join(dir, 'keyframe-review.png') });
    const source = [
      'test.use({ bundleMode: "single-file" });',
      'test("Checkpoint prose", async () => {',
      '  await sourceCommand(() => checkpoint(',
      '    conceptText`Review the ${conceptLink(orphan.id, "orphaned configuration")}.`,',
      '    { keyFrames: [treatAsDifferentPages, orphan] },',
      '  ));',
      '  await sourceCommand(() => checkpoint("accepted"));',
      '});',
    ].join('\n');
    const text = conceptText`Review the ${conceptLink(orphan.id, 'orphaned configuration')}.`;
    const timestamp = '2026-10-30T12:00:00Z';
    const manifest = { testName: 'Checkpoint prose', logs: [], testSource: source,
      checkpoints: [{ id: 1, message: 'Review the orphaned configuration.', text, timestamp, sourceLine: 3 }],
      keyFrames: [treatAsDifferentPages, orphan].map(concept => ({ docId: concept.id, filename: 'keyframe-review.png', timestamp, checkpointId: 1 })),
    };
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    try {
      await page.goto(`/${path.basename(run)}/checkpoint-prose`);
      await page.getByRole('button', { name: 'Test Code', exact: true }).click();
      const checkpoint = page.getByRole('region', { name: 'Checkpoint: Review the orphaned configuration.', exact: true });
      await expect(checkpoint).toBeVisible();
      await expect(page.locator('[data-source-line="4"]')).toHaveCount(0);
      await expect(page.locator('[data-source-line="6"]')).toHaveCount(0);
      const frames = checkpoint.getByLabel('Checkpoint keyframes');
      await expect(frames.locator('img')).toHaveCount(2);
      await frames.getByRole('button', { name: `About ${orphan.name}`, exact: true }).click();
      const keyframeDetails = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
      await expect(keyframeDetails.getByRole('heading', { name: orphan.name, exact: true })).toBeVisible();
      await keyframeDetails.getByRole('button', { name: 'Close concept details', exact: true }).click();
      await expect.poll(() => frames.locator('img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await frames.getByRole('button', { name: orphan.name, exact: true }).hover();
      await expect(page.getByRole('tooltip', { name: 'Keyframe preview' })).toContainText(orphan.name);
      await expect(page.getByRole('tooltip', { name: 'Keyframe preview' }).locator('img')).toBeVisible();
      expect((await page.getByRole('tooltip', { name: 'Keyframe preview' }).boundingBox())!.y).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath('checkpoint-preview.png'), fullPage: true });
      await checkpoint.getByRole('link', { name: 'orphaned configuration', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
      await expect(panel.getByRole('heading', { name: orphan.name, exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
      await page.getByRole('checkbox', { name: 'show the real code', exact: true }).check();
      await expect(checkpoint).toHaveCount(0);
      await expect(page.locator('[data-source-line="4"]')).toContainText('conceptText`Review');
      await expect(page.locator('[data-source-line="5"]')).toContainText('keyFrames: [treatAsDifferentPages, orphan]');
      await page.getByRole('checkbox', { name: 'show the real code', exact: true }).uncheck();
      await expect(checkpoint).toBeVisible();
    } finally {
      await page.goto('about:blank');
      rmSync(run, { recursive: true, force: true });
    }
  });
}
