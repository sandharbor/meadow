/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/concepts*', route => route.fulfill({ json: [
    { id: 'source-review', name: 'Source Review', subAreas: [{ areaId: 'bundle/sourcing', order: 1 }] },
    { id: 'filter-mixing', name: 'Filter Mixing', subAreas: [{ areaId: 'bundle/curation', order: 1 }] },
  ] }));
  await page.route(/\/api\/bundle-docs(?:\?.*)?$/,  route => route.fulfill({ json: [] }));
  await page.route(/\/api\/app-areas(?:\?.*)?$/,  route => route.fulfill({ json: [
    { id: 'bundle/sourcing', name: 'Bundle Sourcing', parentId: 'bundle' },
    { id: 'bundle/curation', name: 'Bundle Curation', parentId: 'bundle' },
  ] }));
  const scenarios = [
    { slug: 'adds-a-page', area: 'bundle/sourcing', categories: ['add'] },
    { slug: 'moves-and-renames', area: 'bundle/sourcing', categories: ['move', 'rename'] },
    { slug: 'removes-a-page', area: 'bundle/sourcing', categories: ['remove'] },
    { slug: 'no-source-change', area: 'bundle/sourcing', categories: [] },
    { slug: 'curation-add', area: 'bundle/curation', categories: ['add'] },
  ].map(scenario => ({ slug: scenario.slug, testName: scenario.slug, status: 'passed', duration: 1,
    bundleMode: 'single-file', executionSurface: 'browser', conceptIds: [], appAreaDocIds: [scenario.area],
    subAreaDocIds: [], sourceChangeCategories: scenario.categories, bundleDocIds: [], keyFrames: [], hasIssues: false }));
  await page.route('**/api/runs/source-changes', route => route.fulfill({ json: { runId: 'source-changes', scenarios } }));
  await page.route('**/api/runs/source-changes/health', route => route.fulfill({ json: {} }));
  await page.goto('/source-changes?view=list');
});

test('source changes sit with Sourcing before Curation and share the sub-area indentation', async ({ page }, testInfo) => {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await areas.getByRole('button', { name: 'Curation', exact: true }).click();
  const sourcing = page.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
  const changes = page.getByRole('group', { name: 'Source changes', exact: true });
  const curation = page.getByRole('group', { name: 'Bundle Curation sub-areas', exact: true });
  await expect(changes.getByText('Sourcing')).toBeVisible();
  await expect(changes.getByText('Source changes', { exact: true })).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const sourcingBox = (await sourcing.boundingBox())!;
    const changesBox = (await changes.boundingBox())!;
    const curationBox = (await curation.boundingBox())!;
    expect(changesBox.y).toBeGreaterThanOrEqual(sourcingBox.y + sourcingBox.height);
    expect(curationBox.y).toBeGreaterThanOrEqual(changesBox.y + changesBox.height);
    expect(changesBox.x).toBe(sourcingBox.x);
    expect(changesBox.x).toBe(curationBox.x);
    expect(changesBox.x).toBeGreaterThan((await areas.boundingBox())!.x);
    expect(changesBox.x + changesBox.width).toBeLessThanOrEqual(width);
    await page.getByRole('group', { name: 'Area details', exact: true }).screenshot({ path: testInfo.outputPath(`source-changes-hierarchy-${width}.png`) });
  }
});

// Selecting Sourcing reveals the source-change categories. A scenario matches
// when any of its source changes falls in any selected category.
test('source-change categories narrow sourcing scenarios by any applied change', async ({ page }, testInfo) => {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  const changes = page.getByRole('group', { name: 'Source changes', exact: true });
  await expect(changes).toHaveCount(0);
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await expect(changes.getByRole('button')).toHaveText(['All', 'add', 'move', 'rename', 'modify', 'remove']);
  await expect(changes.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(changes.getByRole('button', { name: 'modify', exact: true })).toHaveAttribute('title', 'No matching scenarios with the current filters.');

  await changes.getByRole('button', { name: 'rename', exact: true }).click();
  await expect(page.getByRole('link', { name: 'moves and renames' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'adds a page' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'no source change' })).toHaveCount(0);
  await changes.getByRole('button', { name: 'add', exact: true }).click();
  await expect(page.getByRole('link', { name: 'adds a page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'moves and renames' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'removes a page' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'curation add' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('source-change-categories.png') });

  await page.reload();
  await expect(changes.getByRole('button', { name: 'add', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await expect(changes).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]sourcechange=/);
  await expect(page.getByRole('link', { name: 'removes a page' })).toBeVisible();
});
