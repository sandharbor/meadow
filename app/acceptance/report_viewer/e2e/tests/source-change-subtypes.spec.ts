/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

// Only the run is synthetic. Definitions, documentation, and implementation links use the real registry.
test.beforeEach(async ({ page }) => {
  const examples = [
    ['content only', ['source-content-change'], ['modify']],
    ['config only', ['source-configuration-change'], []],
    ['sensitivity only', ['source-sensitivity-change'], []],
    ['content and config', ['source-content-change', 'source-configuration-change'], ['modify']],
    ['missing file', ['source-removal-missing'], ['remove']],
    ['unreachable page', ['source-removal-unreachable'], []],
    ['blacklisted page', ['source-removal-blacklisted'], []],
    ['disconnected source', ['source-removal-disconnected'], []],
    ['legacy unclassified modification', [], ['modify']],
  ] as const;
  await page.route('**/api/runs/change-subtypes', route => route.fulfill({ json: { runId: 'change-subtypes', scenarios: examples.map(([name, conceptIds, categories]) => ({
    slug: name.replaceAll(' ', '-'), testName: name, status: 'passed', duration: 1,
    bundleMode: 'single-file', executionSurface: 'browser', conceptIds, appAreaDocIds: ['bundle/sourcing'],
    subAreaDocIds: [], sourceChangeCategories: categories, bundleDocIds: [], keyFrames: [], hasIssues: false,
  })) } }));
  await page.route('**/api/runs/change-subtypes/health', route => route.fulfill({ json: {} }));
  await page.goto('/change-subtypes?view=list&area=bundle%2Fsourcing');
});

test('selected parents reveal further-indented subtype rows on desktop and mobile', async ({ page }, testInfo) => {
  const parent = page.getByRole('group', { name: 'Source changes', exact: true });
  const modify = page.getByRole('group', { name: 'Modify source change subtypes', exact: true });
  const remove = page.getByRole('group', { name: 'Remove source change subtypes', exact: true });
  await expect(modify).toHaveCount(0);
  await expect(remove).toHaveCount(0);
  await parent.getByRole('button', { name: 'modify', exact: true }).click();
  await expect(modify.locator('button[aria-pressed="false"]')).toHaveText(['Source change', 'Sensitivity changed', 'Config change']);
  await parent.getByRole('button', { name: 'remove', exact: true }).click();
  for (const label of ['Source missing', 'Disconnected', 'Blacklisted', 'Not reachable']) await expect(remove.getByRole('button', { name: label, exact: true })).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const parentBox = (await parent.boundingBox())!, modifyBox = (await modify.boundingBox())!, removeBox = (await remove.boundingBox())!;
    expect(modifyBox.x).toBeGreaterThan(parentBox.x);
    expect(removeBox.x).toBe(modifyBox.x);
    expect(modifyBox.y).toBeGreaterThan(parentBox.y);
    expect(removeBox.y).toBeGreaterThan(modifyBox.y);
    expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(width);
    await page.getByRole('group', { name: 'Area details', exact: true }).screenshot({ path: testInfo.outputPath(`source-change-subtypes-${width}.png`) });
  }
});

test('subtypes refine their own parent branch, survive reload, and clear with that parent', async ({ page }, testInfo) => {
  const parent = page.getByRole('group', { name: 'Source changes', exact: true });
  const modify = page.getByRole('group', { name: 'Modify source change subtypes', exact: true });
  const remove = page.getByRole('group', { name: 'Remove source change subtypes', exact: true });
  await parent.getByRole('button', { name: 'modify', exact: true }).click();
  await expect(page.getByRole('link', { name: 'legacy unclassified modification' })).toBeVisible();
  await modify.getByRole('button', { name: 'Config change', exact: true }).click();
  for (const name of ['config only', 'content and config']) await expect(page.getByRole('link', { name })).toBeVisible();
  for (const name of ['content only', 'sensitivity only', 'legacy unclassified modification']) await expect(page.getByRole('link', { name })).toHaveCount(0);
  await parent.getByRole('button', { name: 'remove', exact: true }).click();
  await remove.getByRole('button', { name: 'Source missing', exact: true }).click();
  await expect(page.getByRole('link', { name: 'missing file' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'config only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'unreachable page' })).toHaveCount(0);
  await page.reload();
  await expect(modify.getByRole('button', { name: 'Config change', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(remove.getByRole('button', { name: 'Source missing', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('group', { name: 'Area details', exact: true }).screenshot({ path: testInfo.outputPath('source-change-subtypes-selected.png') });
  await modify.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('link', { name: 'sensitivity only' })).toBeVisible();
  await expect(remove.getByRole('button', { name: 'Source missing', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await parent.getByRole('button', { name: 'remove', exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(page).not.toHaveURL(/source-removal-missing/);
  await parent.getByRole('button', { name: 'All', exact: true }).click();
  await expect(modify).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]sourcechangesubtype=/);
});

test('each subtype opens its documentation and current implementation without changing the filter', async ({ page }) => {
  await page.getByRole('group', { name: 'Source changes', exact: true }).getByRole('button', { name: 'modify', exact: true }).click();
  const row = page.getByRole('group', { name: 'Modify source change subtypes', exact: true });
  await row.getByRole('button', { name: 'Read Source Configuration Change', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Source Configuration Change', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Implemented by', exact: true })).toContainText('sourceConfigurationChangeDefinition');
  await expect(row.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
