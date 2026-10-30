/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { URL } from 'node:url';
import { bundleCuration, bundleSourcing, bundleGeneration, customize, hooks, filters, filterMixing, sensitive, sourceReviewWorkspace } from '../../../../concepts/index.js';

// Use the real registry so feature classification and report rendering are checked together.
// Use a narrow desktop as well as mobile so these labels genuinely need expansion.
for (const width of [1024, 390]) {
  test(`expanded scenario metadata groups declared sub-areas at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const manifest = {
      testName: 'Filtering during source review', bundleMode: 'single-file', logs: [], keyFrames: [],
      conceptIds: [filters.id, filterMixing.id, sensitive.id],
      appAreaDocIds: [bundleSourcing.id, bundleCuration.id],
      subAreaDocIds: [filterMixing.id, sourceReviewWorkspace.id, filters.id],
    };
    await page.route('**/api/runs/subarea-preview', route => route.fulfill({ json: {
      runId: 'subarea-preview', scenarios: [{ ...manifest, slug: 'evidence', status: 'passed', duration: 1,
        executionSurface: 'browser', bundleDocIds: [], hasIssues: false }],
    } }));
    await page.route('**/api/runs/subarea-preview/health', route => route.fulfill({ json: {} }));
    await page.route('**/api/subarea-preview/evidence/*', route => {
      const endpoint = new URL(route.request().url()).pathname.split('/').pop();
      const json = endpoint === 'manifest' ? manifest
        : endpoint === 'test-source' ? { source: '' } : endpoint === 'backend-telemetry' ? {} : [];
      return route.fulfill({ json });
    });
    await page.goto('/subarea-preview/evidence');
    const metadata = page.getByRole('region', { name: 'Scenario metadata', exact: true });
    await metadata.getByRole('button', { name: 'Expand scenario metadata', exact: true }).click();
    const starts = metadata.getByRole('group', { name: 'Starts with', exact: true });
    const areas = metadata.getByRole('group', { name: 'Areas', exact: true });
    const sourcing = metadata.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
    const curation = metadata.getByRole('group', { name: 'Bundle Curation sub-areas', exact: true });
    const concepts = metadata.getByRole('group', { name: 'Concepts', exact: true });
    await expect(sourcing.getByRole('link')).toHaveText(['Source Review Workspace']);
    await expect(curation.getByRole('link')).toHaveText(['Custom Filtering', 'Filter Mixing']);
    await expect(concepts.getByRole('button')).toHaveText([sensitive.name]);
    const rows = [starts, areas, sourcing, curation, concepts];
    for (let i = 1; i < rows.length; i++) {
      const previous = (await rows[i - 1].boundingBox())!;
      const current = (await rows[i].boundingBox())!;
      expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
      expect(current.x + current.width).toBeLessThanOrEqual(width);
    }
    expect((await curation.boundingBox())!.x).toBeGreaterThan((await areas.boundingBox())!.x);
    await metadata.screenshot({ path: testInfo.outputPath('expanded-scenario-sub-areas.png') });
    await metadata.getByRole('button', { name: 'Collapse scenario metadata', exact: true }).click();
    await expect(metadata.getByRole('button', { name: 'Expand scenario metadata', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await metadata.getByRole('button', { name: 'Expand scenario metadata', exact: true }).click();
    await curation.getByRole('link', { name: filterMixing.name, exact: true }).click();
    await expect(page).toHaveURL('/subarea-preview?area=bundle%2Fcuration&subarea=filter-mixing');
    const curationFilters = page.getByRole('group', { name: 'Bundle Curation sub-areas', exact: true });
    await expect(curationFilters.getByRole('button', { name: filterMixing.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('nested customization metadata links to a child filter with its parent visible', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const manifest = { testName: 'Hook customization', bundleMode: 'single-file', logs: [], keyFrames: [],
    conceptIds: [customize.id, hooks.id], appAreaDocIds: [bundleGeneration.id], subAreaDocIds: [customize.id, hooks.id] };
  await page.route('**/api/runs/nested-preview', route => route.fulfill({ json: {
    runId: 'nested-preview', scenarios: [{ ...manifest, slug: 'evidence', status: 'passed', duration: 1,
      executionSurface: 'browser', bundleDocIds: [], hasIssues: false }],
  } }));
  await page.route('**/api/nested-preview/evidence/*', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: endpoint === 'manifest' ? manifest
      : endpoint === 'test-source' ? { source: '' } : endpoint === 'backend-telemetry' ? {} : [] });
  });
  await page.goto('/nested-preview/evidence');
  const metadata = page.getByRole('region', { name: 'Scenario metadata', exact: true });
  await metadata.getByRole('button', { name: 'Expand scenario metadata', exact: true }).click();
  const generation = metadata.getByRole('group', { name: 'Bundle Generation sub-areas', exact: true });
  const customization = metadata.getByRole('group', { name: 'Bundle Customization sub-areas', exact: true });
  await expect(generation.getByRole('link')).toHaveText([customize.name]);
  await expect(customization.getByRole('link')).toHaveText([hooks.name]);
  expect((await customization.boundingBox())!.x).toBeGreaterThan((await generation.boundingBox())!.x);
  expect((await customization.boundingBox())!.x + (await customization.boundingBox())!.width).toBeLessThanOrEqual(390);
  await metadata.screenshot({ path: testInfo.outputPath('nested-customization.png') });
  await customization.getByRole('link', { name: hooks.name, exact: true }).click();
  const parentFilters = page.getByRole('group', { name: 'Bundle Generation sub-areas', exact: true });
  const childFilters = page.getByRole('group', { name: 'Bundle Customization sub-areas', exact: true });
  await expect(parentFilters.getByRole('button', { name: customize.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(childFilters.getByRole('button', { name: hooks.name, exact: true })).toHaveAttribute('aria-pressed', 'true');
});
