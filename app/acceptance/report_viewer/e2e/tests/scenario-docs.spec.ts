/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conceptLink, conceptText, sourceSensitivity } from '../../../../concepts/index.js';

for (const width of [1280, 390]) {
  test(`Docs reads saved scenarios with filters, evidence, and display controls at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
    mkdirSync(root, { recursive: true });
    const run = mkdtempSync(path.join(root, 'rv-docs-'));
    const runId = path.basename(run);
    const dir = path.join(run, 'readable-scenario');
    mkdirSync(dir);
    const sections = [
      { id: 'setup', type: 'setup', text: conceptText`Open the saved starting state.` },
      { id: 'review', type: 'test', text: conceptText`Review the ${conceptLink(sourceSensitivity.id, 'source-sensitive')} addition.` },
    ];
    const source = [
      'const sections = scenarioSections({});',
      'test("Readable scenario", async () => {',
      '  await test.step(sections.steps.setup, async () => {',
      '    await sourceCommand(() => editor.open());',
      '    await sourceCommand(() => checkpoint("Ready"));',
      '  });',
      '  await test.step(sections.steps.review, async () => {',
      '    await sourceCommand(() => editor.review());',
      '    await sourceCommand(() => checkpoint("Reviewed"));',
      '    await sourceCommand(() => checkpoint("Reviewed"));',
      '  });',
      '});',
    ].join('\n');
    const info = { testName: 'Readable scenario', description: 'A compact saved walkthrough.', sections, executionSurface: 'browser',
      duration: 2, conceptIds: [sourceSensitivity.id], appAreaDocIds: [], bundleDocIds: [], status: 'passed',
      keyFrames: [{ docId: sourceSensitivity.id, filename: 'evidence.png', timestamp: '2026-10-21T10:00:03Z' }] };
    const command = (id: number, line: number, text: string) => ({ id, line, text, status: 'completed' });
    const ticks = [
      { timestamp: '2026-10-21T10:00:00Z', sourceCommand: command(1, 4, 'editor.open()') },
      { timestamp: '2026-10-21T10:00:01Z', isCheckpoint: true, checkpointMessage: 'Ready', sourceCommand: command(2, 5, 'checkpoint("Ready")') },
      { timestamp: '2026-10-21T10:00:02Z', sourceCommand: command(3, 8, 'editor.review()') },
      { timestamp: '2026-10-21T10:00:04Z', isCheckpoint: true, checkpointMessage: 'Reviewed', sourceCommand: command(4, 9, 'checkpoint("Reviewed")') },
      { timestamp: '2026-10-21T10:00:05Z', isCheckpoint: true, checkpointMessage: 'Reviewed', sourceCommand: command(5, 10, 'checkpoint("Reviewed")') },
    ];
    writeFileSync(path.join(dir, 'status.txt'), 'passed');
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...info, testSource: source, ticks }));
    writeFileSync(path.join(dir, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
    writeFileSync(path.join(dir, 'evidence.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0YoAAAAASUVORK5CYII=', 'base64'));
    linkSync(path.resolve('src/server/fixture-scenario/assets/mock-video.webm'), path.join(dir, 'video.webm'));
    const cliDir = path.join(run, 'command-scenario');
    mkdirSync(cliDir);
    writeFileSync(path.join(cliDir, 'status.txt'), 'passed');
    writeFileSync(path.join(cliDir, 'manifest.json'), JSON.stringify({ ...info, testName: 'Command scenario', executionSurface: 'cli', keyFrames: [], sections: [], ticks: [] }));
    await page.route('**/api/checkpoints/**', route => route.fulfill({ json: {
      checkpoints: [1, 2, 3].map(index => ({ index, message: 'Saved', openable: true, hostedAvailable: false })),
    } }));
    let opened: unknown;
    await page.route('**/api/saved-states/open', async route => {
      opened = route.request().postDataJSON();
      await route.fulfill({ json: {} });
    });
    try {
      const response = await request.get(`/api/${runId}/readable-scenario/documentation`);
      expect(response.ok()).toBe(true);
      expect((await response.json()).events.map((event: { kind: string }) => event.kind)).toEqual([
        'section', 'step', 'checkpoint', 'section', 'step', 'screenshot', 'checkpoint', 'checkpoint',
      ]);
      await page.goto(`/${runId}?view=docs&surface=browser`);
      const row = page.getByRole('article', { name: 'Readable scenario', exact: true });
      await row.scrollIntoViewIfNeeded();
      await expect(page.getByRole('article')).toHaveCount(1);
      await expect(row.getByLabel('Checkpoint 3', { exact: true })).toBeVisible();
      await expect(row.getByRole('heading', { name: 'Open the saved starting state.', exact: true })).toBeVisible();
      const image = row.getByRole('img', { name: sourceSensitivity.name, exact: true });
      await expect(image).toBeVisible();
      await expect(row.getByRole('link', { name: `Enlarge screenshot: ${sourceSensitivity.name}`, exact: true })).toHaveAttribute('target', '_blank');
      const videoBox = (await row.locator('video').boundingBox())!;
      const titleBox = (await row.getByRole('link', { name: 'Readable scenario', exact: true }).boundingBox())!;
      if (width < 1024) expect(titleBox.y).toBeGreaterThanOrEqual(videoBox.y + videoBox.height);
      else expect(titleBox.x).toBeGreaterThanOrEqual(videoBox.x + videoBox.width);
      const controls = page.getByRole('group', { name: 'Show in Docs', exact: true });
      await expect(row.getByLabel('Recorded step', { exact: true })).toHaveCount(0);
      await controls.getByRole('checkbox', { name: 'Steps', exact: true }).check();
      await expect(row.getByLabel('Recorded step', { exact: true })).toHaveCount(2);
      await row.getByRole('button', { name: 'Open checkpoint 3 in Dev Tools with Local', exact: true }).click();
      await expect.poll(() => opened).toEqual({ origin: { kind: 'checkpoint', runId, scenario: 'readable-scenario', checkpoint: 3 }, serviceTarget: 'local', launch: 'app' });
      await row.getByRole('link', { name: 'source-sensitive', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
      await expect(panel.getByRole('heading', { name: sourceSensitivity.name, exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
      for (const name of ['Checkpoints', 'Screenshots', 'Sections', 'Video', 'Related links']) await controls.getByRole('checkbox', { name, exact: true }).uncheck();
      await expect(row.locator('video')).toHaveCount(0);
      await expect(image).toHaveCount(0);
      await expect(row.getByLabel('Checkpoint 1', { exact: true })).toHaveCount(0);
      await expect(row.getByLabel('Scenario walkthrough', { exact: true }).getByRole('heading')).toHaveCount(0);
      await expect(row.locator('dl[aria-label="Scenario metadata"]')).toBeHidden();
      await page.reload();
      await expect(controls.getByRole('checkbox', { name: 'Video', exact: true })).not.toBeChecked();
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await expect(row.locator('video')).toHaveCount(1);
      await page.getByRole('button', { name: 'Docs', exact: true }).click();
      await expect(page).toHaveURL(new RegExp('surface=browser'));
      await page.getByRole('group', { name: 'Interface', exact: true }).getByRole('button', { name: 'All', exact: true }).click();
      await expect(page.getByRole('article')).toHaveCount(2);
      for (const name of ['Checkpoints', 'Screenshots', 'Sections', 'Video', 'Related links']) await controls.getByRole('checkbox', { name, exact: true }).check();
      await controls.getByRole('checkbox', { name: 'Steps', exact: true }).uncheck();
      await row.scrollIntoViewIfNeeded();
      expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
      await row.screenshot({ path: testInfo.outputPath(`scenario-docs-${width}.png`) });
    } finally {
      await page.goto('about:blank');
      rmSync(run, { recursive: true, force: true });
    }
  });
}
