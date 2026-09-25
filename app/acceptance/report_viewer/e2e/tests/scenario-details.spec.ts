/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('scenario details read captured descriptions from artifacts and keep scenario links and filters', async ({ page, request }) => {
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
  }
  try {
    const response = await request.get(`/api/runs/${runId}`);
    expect(response.ok()).toBe(true);
    const { scenarios } = await response.json() as { scenarios: { slug: string; description: string }[] };
    expect(scenarios.find(scenario => scenario.slug === 'bundle-preview')?.description).toBe(description);
    expect(scenarios.find(scenario => scenario.slug === 'command-export')?.description).toBe(description);
    await page.goto(`/${runId}`);
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Description', exact: true })).toBeVisible();
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'bundle preview', exact: true }) });
    await expect(row).toContainText(description);
    await expect(row.getByRole('link')).toHaveAttribute('href', `/${runId}/bundle-preview`);
    await expect(page.getByText('No description captured in this run.', { exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Interface', exact: true }).getByRole('button', { name: 'CLI (1)', exact: true }).click();
    await expect(page.getByRole('link', { name: 'command export', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'bundle preview', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible();
  } finally {
    await page.goto('about:blank');
    rmSync(run, { recursive: true, force: true });
  }
});
