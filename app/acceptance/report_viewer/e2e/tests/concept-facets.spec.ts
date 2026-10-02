/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { sourcingReviewRedesign } from '../../../../concepts/index.js';

test('pending declarations remain inspectable without appearing as passing evidence', async ({ page }) => {
  const runId = 'pending-design-evidence';
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: {
    runId,
    scenarios: [
      { slug: 'implemented-behavior', testName: 'Implemented behavior', status: 'passed', conceptIds: ['source-snapshot'] },
      { slug: 'planned-behavior', testName: 'Planned behavior', status: 'skipped', conceptIds: ['pending-source-proposal', sourcingReviewRedesign.id],
        description: 'Planned scenario, not executable evidence. Preserve the reviewed source capture.' },
    ].map(scenario => ({ ...scenario, duration: 0, bundleMode: 'single-file', executionSurface: 'browser',
      appAreaDocIds: [], bundleDocIds: [], keyFrames: [], hasIssues: false })),
  } }));
  await page.goto(`/${runId}?view=details`);
  const planned = page.getByRole('article', { name: 'Planned behavior', exact: true });
  await expect(planned).toContainText('NOT RUN');
  await expect(planned).toContainText('Planned scenario, not executable evidence.');
  await expect(page.getByText('Not run', { exact: true })).toBeVisible();
  const passing = page.getByText('Passing', { exact: true }).locator('..');
  await expect(passing).toContainText('(1)');
  const notRun = page.getByText('Not run', { exact: true }).locator('..');
  await expect(notRun).toContainText('(1)');
  await expect(page.getByRole('article', { name: 'Implemented behavior', exact: true })).toContainText('PASS');
  await page.getByRole('group', { name: 'Concept filters', exact: true })
    .getByRole('button', { name: sourcingReviewRedesign.name, exact: true }).click();
  await expect(planned).toBeVisible();
  await expect(page.getByRole('article', { name: 'Implemented behavior', exact: true })).toHaveCount(0);
});

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
  const conceptsToggle = page.getByRole('button', { name: /^Concepts(?: \d+ selected)?$/ });
  await expect(conceptsToggle).toHaveAttribute('aria-expanded', 'false');
  const detailedConcepts = page.getByRole('group', { name: 'Detailed concept filters', exact: true });
  await expect(detailedConcepts).not.toBeVisible();
  const facets = page.getByRole('group', { name: 'Concept filters', exact: true });
  await expect(facets.getByRole('button', { name: 'Publishing', exact: true })).toHaveCount(0);
  await facets.getByRole('button', { name: /^and \d+ hidden$/ }).click();
  await expect(facets.getByRole('button', { name: 'Publishing', exact: true })).toBeVisible();
  await expect(facets.getByRole('button', { name: 'HTML Generation', exact: true })).toBeVisible();
  await facets.getByRole('button', { name: 'hide', exact: true }).click();
  await expect(facets.getByRole('button', { name: 'Newer source material pauses frontier exploration', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const metadata = page.getByRole('article', { name: 'Frontier rule evidence', exact: true }).locator('dl[aria-label="Scenario metadata"]');
  const ruleBadge = metadata.getByText('Newer source material pauses frontier exploration', { exact: true });
  await expect(ruleBadge).toHaveCSS('opacity', '0.2');
  await expect(ruleBadge).toHaveAttribute('title', 'Hidden in the filters above');
  await expect(metadata.getByText('Frontier Bundle Page', { exact: true })).toHaveCSS('opacity', '1');
  await facets.getByRole('button', { name: 'Frontier Bundle Page', exact: true }).click();
  await ruleBadge.click();
  await page.getByRole('menuitem', { name: 'restart with this', exact: true }).click();
  await expect(page).toHaveURL(/doc=frontier-pending-sources/);
  await expect(page.getByRole('heading', { name: 'Newer source material pauses frontier exploration', exact: true })).toBeVisible();
  await expect(conceptsToggle).toHaveText('▸Concepts1 selected');
  await conceptsToggle.click();
  await expect(detailedConcepts).toBeVisible();
  await expect(detailedConcepts.getByRole('button', { name: 'Newer source material pauses frontier exploration', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const filteredUrl = page.url();
  await conceptsToggle.click();
  await expect(detailedConcepts).not.toBeVisible();
  expect(page.url()).toBe(filteredUrl);
  await expect(conceptsToggle).toHaveText('▸Concepts1 selected');
  await expect(ruleBadge).toHaveAttribute('data-selected', 'true');
  await expect(ruleBadge).toHaveCSS('opacity', '1');
  await expect(ruleBadge).toHaveCSS('outline-width', '2px');
  await expect(page.getByText('Frontier rule evidence', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(conceptsToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(conceptsToggle).toContainText('1 selected');
  await expect(page.getByRole('heading', { name: 'Newer source material pauses frontier exploration', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Frontier Bundle Page', exact: true }).click();
  await expect(page).toHaveURL(/doc=frontier(?:&|$)/);
});

test('detailed concepts follow matching scenarios and retain visible counts for hidden selections', async ({ page }) => {
  const runId = 'detailed-concept-filtering';
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: {
    runId,
    scenarios: [
      { slug: 'file-review', bundleMode: 'single-file', conceptIds: ['frontier', 'frontier-pending-sources', 'frontier-live-discovery'] },
      { slug: 'folder-review', bundleMode: 'single-folder', conceptIds: ['frontier', 'frontier-dismissal'] },
    ].map(scenario => ({ ...scenario, testName: scenario.slug, status: 'passed', duration: 1,
      executionSurface: 'browser', appAreaDocIds: [], bundleDocIds: [], keyFrames: [], hasIssues: false })),
  } }));
  await page.goto(`/${runId}?view=list`);
  const toggle = page.getByRole('button', { name: /^Concepts(?: \d+ selected)?$/ });
  await toggle.click();
  const concepts = page.getByRole('group', { name: 'Detailed concept filters', exact: true });
  const modes = page.getByRole('group', { name: 'Starts with', exact: true });
  await modes.getByRole('button', { name: 'Single file', exact: true }).click();
  const pending = concepts.getByRole('button', { name: 'Newer source material pauses frontier exploration', exact: true });
  await expect(pending).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Disabling the frontier clears its unavailable notice', exact: true })).toHaveCount(0);
  await pending.click();
  const available = concepts.getByRole('button', { name: 'Frontier exploration checks live sources', exact: true });
  await available.click();
  await expect(toggle).toContainText('2 selected');
  await toggle.click();
  await expect(concepts).not.toBeVisible();
  await expect(toggle).toContainText('2 selected');
  await expect(page.getByRole('link', { name: /file review/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /folder review/ })).toHaveCount(0);
  await toggle.click();
  await modes.getByRole('button', { name: 'All', exact: true }).click();
  await modes.getByRole('button', { name: /^and \d+ hidden$/ }).click();
  await modes.getByRole('button', { name: 'Single folder', exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await concepts.getByRole('button', { name: 'All', exact: true }).click();
  await expect(toggle).not.toContainText('selected');
  await expect(concepts.getByRole('button', { name: 'Disabling the frontier clears its unavailable notice', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /folder review/ })).toBeVisible();
});
