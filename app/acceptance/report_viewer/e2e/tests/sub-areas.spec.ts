/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const concepts = [
    { id: 'identity', name: 'Source Review Identity', subAreas: [{ areaId: 'sourcing', order: 1 }] },
    { id: 'workspace', name: 'Source Review Workspace', subAreas: [{ areaId: 'sourcing', order: 2 }] },
    { id: 'release', name: 'Release Review', subAreas: [{ areaId: 'sharing', order: 1 }] },
    { id: 'other', name: 'Other Sourcing' },
  ].map(concept => ({ ...concept, description: concept.name, searchFacet: true }));
  await page.route('**/api/concepts*', route => route.fulfill({ json: concepts }));
  await page.route('**/api/bundle-docs', route => route.fulfill({ json: [] }));
  await page.route('**/api/app-areas', route => route.fulfill({ json: [
    { id: 'sourcing', name: 'Bundle Sourcing', parentId: 'bundle' },
    { id: 'sharing', name: 'Bundle Sharing', parentId: 'bundle' },
    { id: 'curation', name: 'Bundle Curation', parentId: 'bundle' },
  ] }));
  const scenarios = [
    { slug: 'identity-only', area: 'sourcing', subAreas: ['identity'], concepts: ['identity'] },
    { slug: 'workspace-only', area: 'sourcing', subAreas: ['workspace'], concepts: ['workspace'] },
    { slug: 'both-stages', area: 'sourcing', subAreas: ['identity', 'workspace'], concepts: ['identity', 'workspace'] },
    { slug: 'other-sourcing', area: 'sourcing', subAreas: [], concepts: ['other'] },
    { slug: 'mentions-workspace', area: 'sourcing', subAreas: [], concepts: ['workspace'] },
    { slug: 'release-only', area: 'sharing', subAreas: ['release'], concepts: ['release'] },
    { slug: 'curation-only', area: 'curation', subAreas: [], concepts: [] },
  ].map(scenario => ({ slug: scenario.slug, testName: scenario.slug, status: 'passed', duration: 1,
    bundleMode: 'single-file', executionSurface: 'browser', conceptIds: scenario.concepts,
    appAreaDocIds: [scenario.area], subAreaDocIds: scenario.subAreas, bundleDocIds: [], keyFrames: [], hasIssues: false }));
  await page.route('**/api/runs/sub-areas', route => route.fulfill({ json: { runId: 'sub-areas', scenarios } }));
  await page.route('**/api/runs/sub-areas/health', route => route.fulfill({ json: {} }));
  await page.goto('/sub-areas?view=list');
});

// Sub-areas appear only for selected areas, default to All, and narrow evidence
// by each scenario's declared sub-areas, independently of the concepts it links.
// Selections survive bookmarked URLs.
test('sub-areas follow workflow order and combine with the existing filters', async ({ page }, testInfo) => {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  const subAreas = page.getByRole('group', { name: 'Area details', exact: true });
  await expect(subAreas).toHaveCount(0);
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await expect(subAreas.getByRole('button')).toHaveText(['All', 'Source Review Identity', 'Source Review Workspace']);
  await expect(subAreas.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'other sourcing' })).toBeVisible();
  const identity = subAreas.getByRole('button', { name: 'Source Review Identity', exact: true });
  const workspace = subAreas.getByRole('button', { name: 'Source Review Workspace', exact: true });
  await identity.click();
  await expect(page.getByRole('link', { name: 'identity only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'workspace only' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'both stages' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'other sourcing' })).toHaveCount(0);
  await expect(workspace).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sub-areas.png') });
  await page.reload();
  await expect(identity).toHaveAttribute('aria-pressed', 'true');
  await workspace.click();
  await expect(page.getByRole('link', { name: 'workspace only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'mentions workspace' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Concept filters', exact: true }).getByRole('button', { name: 'Source Review Workspace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'identity only' })).toHaveCount(0);
  await subAreas.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]subarea=/);
  await expect(page).toHaveURL(/[?&]doc=workspace/);
  await expect(page.getByRole('link', { name: 'workspace only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'mentions workspace' })).toBeVisible();
});

// Multiple selected areas expose their own sub-area groups. Removing an area
// drops only its inapplicable selections, avoiding an invisible stale filter.
test('area changes retain compatible sub-areas and clear inapplicable ones', async ({ page }) => {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  const subAreas = page.getByRole('group', { name: 'Area details', exact: true });
  const sourcing = subAreas.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
  const sharing = subAreas.getByRole('group', { name: 'Bundle Sharing sub-areas', exact: true });
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await subAreas.getByRole('button', { name: 'Source Review Identity', exact: true }).click();
  await areas.getByRole('button', { name: 'Sharing', exact: true }).click();
  await expect(subAreas.getByRole('button', { name: 'Source Review Workspace', exact: true })).toBeVisible();
  const release = subAreas.getByRole('button', { name: 'Release Review', exact: true });
  await release.click();
  await expect(sourcing.getByRole('button')).toHaveText(['All', 'Source Review Identity', 'Source Review Workspace']);
  await expect(sharing.getByRole('button')).toHaveText(['All', 'Release Review']);
  await expect(page.getByRole('link', { name: 'release only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'identity only' })).toBeVisible();
  await sourcing.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]subarea=identity/);
  await expect(release).toHaveAttribute('aria-pressed', 'true');
  await expect(sourcing.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sharing.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await sourcing.getByRole('button', { name: 'Source Review Identity', exact: true }).click();
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]subarea=identity/);
  await expect(release).toHaveAttribute('aria-pressed', 'true');
  await expect(subAreas.getByRole('button', { name: 'Source Review Identity', exact: true })).toHaveCount(0);
  await areas.getByRole('button', { name: 'All', exact: true }).click();
  await expect(subAreas).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]subarea=/);
  await expect(page.getByRole('link', { name: 'other sourcing' })).toBeVisible();
  await areas.getByRole('button', { name: 'Curation', exact: true }).click();
  await expect(subAreas).toHaveCount(0);
});

test('sub-area rows identify their parents and remain inset at narrow widths', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await areas.getByRole('button', { name: 'Sharing', exact: true }).click();
  const sourcing = page.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
  const sharing = page.getByRole('group', { name: 'Bundle Sharing sub-areas', exact: true });
  await expect(sourcing).toBeVisible();
  await expect(sharing).toBeVisible();
  const areaBox = (await areas.boundingBox())!;
  const sourcingBox = (await sourcing.boundingBox())!;
  const sharingBox = (await sharing.boundingBox())!;
  expect(sourcingBox.x).toBeGreaterThan(areaBox.x);
  expect(sharingBox.x).toBe(sourcingBox.x);
  expect(sharingBox.y).toBeGreaterThanOrEqual(sourcingBox.y + sourcingBox.height);
  expect(sharingBox.x + sharingBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('parent-sub-area-rows.png'), fullPage: true });
});

test('a sub-area used by a customized mix keeps its parent group visible', async ({ page }) => {
  await page.goto(`/sub-areas?view=list&mix=${encodeURIComponent('without(everything, subarea:identity)')}`);
  const sourcing = page.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
  await expect(sourcing.getByRole('button', { name: 'Source Review Identity', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'identity only' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'workspace only' })).toBeVisible();
  await sourcing.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]mix=/);
  await expect(page.getByRole('link', { name: 'identity only' })).toBeVisible();
  await expect(sourcing).toHaveCount(0);
});
