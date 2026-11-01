/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/concepts*', route => route.fulfill({ json: [
    { id: 'source-review', name: 'Source Review', subAreas: [{ areaId: 'bundle/sourcing', order: 1 }] },
    { id: 'filter-mixing', name: 'Filter Mixing', subAreas: [{ areaId: 'bundle/curation', order: 1 }] },
    { id: 'tracking-panel', name: 'Tracking Changes Panel', kind: 'ui-sub-area', appAreaIds: ['bundle/sourcing'] },
    { id: 'node-details', name: 'Node Details', kind: 'ui-sub-area', appAreaIds: ['bundle/curation'] },
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
  await expect(changes.getByText('Sourcing', { exact: true })).toHaveCount(0);
  const details = page.getByRole('group', { name: 'Area details', exact: true });
  await expect(details.getByRole('heading')).toHaveText(['Sourcing', 'Curation']);
  const sourcingGroup = details.getByRole('region', { name: 'Bundle Sourcing filters', exact: true });
  const curationGroup = details.getByRole('region', { name: 'Bundle Curation filters', exact: true });
  await expect(sourcingGroup.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas', 'Source changes']);
  await expect(curationGroup.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas']);
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
    const headingBox = (await sourcingGroup.getByRole('heading').boundingBox())!;
    expect(sourcingBox.x).toBeGreaterThan(headingBox.x);
    expect(sourcingBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
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
  await expect(changes.locator('button[aria-pressed]')).toHaveText(['All', 'add', 'move', 'rename', 'modify', 'remove']);
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


test('one selected area shows category labels directly, including nested source changes', async ({ page }, testInfo) => {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  const details = page.getByRole('group', { name: 'Area details', exact: true });
  await expect(details.getByRole('heading')).toHaveCount(0);
  await expect(details.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas', 'Source changes']);
  await details.getByRole('group', { name: 'Source changes', exact: true }).getByRole('button', { name: 'modify', exact: true }).click();
  await expect(details.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas', 'Source changes', 'Source changes → Modify']);
  await expect(details.getByRole('heading')).toHaveCount(0);
  await details.screenshot({ path: testInfo.outputPath('single-area-categories.png') });
  await areas.getByRole('button', { name: 'Curation', exact: true }).click();
  await expect(details.getByRole('heading')).toHaveText(['Sourcing', 'Curation']);
  await expect(details.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas', 'Source changes', 'Source changes → Modify', 'Sub-areas', 'UI sub-areas']);
  await areas.getByRole('button', { name: 'All', exact: true }).click();
  await expect(details).toHaveCount(0);
});

test('child-only bookmarks and mixes identify inferred owners without empty area headings', async ({ page }) => {
  await page.goto('/source-changes?view=list&uisubarea=tracking-panel');
  const details = page.getByRole('group', { name: 'Area details', exact: true });
  await expect(details.getByRole('heading')).toHaveText(['Sourcing']);
  await expect(details.locator('.filter-label')).toHaveText(['UI sub-areas']);
  await page.goto(`/source-changes?view=list&mix=${encodeURIComponent('any(sourcechange:add, subarea:filter-mixing)')}`);
  await expect(details.getByRole('heading')).toHaveText(['Sourcing', 'Curation']);
  await expect(details.locator('.filter-label')).toHaveText(['Source changes', 'Sub-areas']);
  await page.goto(`/source-changes?view=list&mix=${encodeURIComponent('all(area:bundle/sourcing, uisubarea:node-details)')}`);
  await expect(details.getByRole('heading')).toHaveText(['Sourcing', 'Curation']);
  await expect(details.locator('.filter-label')).toHaveText(['Sub-areas', 'UI sub-areas', 'Source changes', 'UI sub-areas']);
});
