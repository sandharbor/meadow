/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { URL } from 'node:url';
import { BUNDLE_MODE_OPTIONS } from '../../src/bundleModes.js';
import { coreConceptIds } from '../../../../concepts/ids.js';
import { startingSelectionDocumentIds } from '../../../../concepts/startingSelectionShapes.js';

test('starting-shape pills explain each variant, its Starting Selection parent, and related scenarios', async ({ page, request }, testInfo) => {
  const concepts = await (await request.get('/api/concepts?all=true')).json() as { id: string; name: string }[];
  const runId = 'starting-shapes';
  const scenarios = BUNDLE_MODE_OPTIONS.map(mode => ({
    slug: mode.id, testName: `Start from ${mode.label}`, bundleMode: mode.id, status: 'passed', duration: 1,
    executionSurface: 'browser', executionSurfaces: ['browser'], hasIssues: false, keyFrames: [],
    conceptIds: [coreConceptIds.startingSelection, startingSelectionDocumentIds[mode.id]],
    appAreaDocIds: [], subAreaDocIds: [], bundleDocIds: [], designPressureIds: [],
  }));
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: { runId, scenarios } }));
  await page.route(`**/api/runs/${runId}/health`, route => route.fulfill({ json: {} }));
  await page.route(`**/api/${runId}/*/*`, route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const endpoint = parts.at(-1), slug = parts.at(-2);
    const scenario = scenarios.find(value => value.slug === slug);
    return route.fulfill({ json: endpoint === 'manifest' ? { ...scenario, logs: [] }
      : endpoint === 'test-source' ? { source: '' } : endpoint === 'backend-telemetry' ? {} : [] });
  });
  for (const mode of BUNDLE_MODE_OPTIONS) {
    const concept = concepts.find(value => value.id === startingSelectionDocumentIds[mode.id])!;
    await page.goto(`/${runId}/${mode.id}`);
    const starts = page.getByRole('region', { name: 'Scenario metadata', exact: true })
      .getByRole('group', { name: 'Starts with', exact: true });
    await starts.getByRole('button', { name: `Read ${concept.name}`, exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
    await expect(details.getByRole('heading', { name: concept.name, exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/${runId}/${mode.id}`);
    await expect(details.getByLabel('1 related scenarios')).toHaveText('1');
    if (mode.id !== 'single-file') await expect(details.getByRole('link', { name: 'Collection Node', exact: true }).first()).toBeVisible();
    await details.getByRole('link', { name: 'Starting Selection', exact: true }).first().click();
    await expect(details.getByRole('heading', { name: 'Starting Selection', exact: true })).toBeVisible();
    await expect(details.getByLabel('4 related scenarios')).toHaveText('4');
    await details.getByRole('button', { name: 'Close concept details', exact: true }).click();
    await starts.getByRole('link', { name: mode.label, exact: true }).click();
    await expect(page).toHaveURL(`/${runId}?mode=${mode.id}`);
    const filters = page.getByRole('group', { name: 'Starts with', exact: true });
    await expect(filters.getByRole('button', { name: mode.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: `Read ${concept.name}`, exact: true }).click();
    await expect(details.getByRole('heading', { name: concept.name, exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/${runId}?mode=${mode.id}`);
    await details.getByRole('button', { name: 'Close concept details', exact: true }).click();
  }
  await page.goto(`/${runId}?view=details`);
  const row = page.getByRole('article', { name: 'Start from Single file', exact: true });
  await row.getByRole('button', { name: 'Read Single File', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Floating concept details', exact: true })
    .getByRole('heading', { name: 'Single File', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('starting-selection-details.png'), fullPage: true });
});
