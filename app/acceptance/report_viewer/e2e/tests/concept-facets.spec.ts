/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

// Only the run is synthetic; concept metadata comes from the real registry/API.
test('run filters use explicit category facets while rules remain directly navigable', async ({ page, request }) => {
  const concepts = await (await request.get('/api/concepts')).json() as { id: string; searchFacet: boolean }[];
  expect(concepts.find(concept => concept.id === 'frontier')?.searchFacet).toBe(true);
  expect(concepts.find(concept => concept.id === 'frontier-pending-sources')?.searchFacet).toBe(false);
  const runId = 'facet-navigation';
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: {
    runId,
    scenarios: [{ slug: 'frontier-rule-evidence', testName: 'Frontier rule evidence', status: 'passed', duration: 1,
      bundleMode: 'single-file', executionSurface: 'browser', conceptIds: ['frontier', 'frontier-pending-sources'],
      appAreaDocIds: [], bundleDocIds: [], keyFrames: [], hasIssues: false }],
  } }));
  await page.goto(`/${runId}`);
  const facets = page.getByRole('group', { name: 'Concept filters', exact: true });
  await expect(facets.getByRole('button', { name: 'Publishing', exact: true })).toBeVisible();
  await expect(facets.getByRole('button', { name: 'HTML Generation', exact: true })).toBeVisible();
  await expect(facets.getByRole('button', { name: 'Pending source changes hide the frontier', exact: true })).toHaveCount(0);
  await facets.getByRole('button', { name: 'Frontier Bundle Page', exact: true }).click();
  await page.getByRole('button', { name: 'Pending source changes hide the frontier', exact: true }).click();
  await expect(page).toHaveURL(/doc=frontier-pending-sources/);
  await expect(page.getByRole('heading', { name: 'Pending source changes hide the frontier', exact: true })).toBeVisible();
  await expect(page.getByText('Frontier rule evidence', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pending source changes hide the frontier', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Frontier Bundle Page', exact: true }).click();
  await expect(page).toHaveURL(/doc=frontier(?:&|$)/);
});
