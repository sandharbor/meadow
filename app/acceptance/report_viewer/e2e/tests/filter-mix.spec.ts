/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/concepts*', route => route.fulfill({ json: [] }));
  await page.route(/\/api\/bundle-docs(?:\?.*)?$/,  route => route.fulfill({ json: [] }));
  await page.route(/\/api\/app-areas(?:\?.*)?$/,  route => route.fulfill({ json: [
    { id: 'bundle/sourcing', name: 'Bundle Sourcing', parentId: 'bundle' },
    { id: 'bundle/review', name: 'Bundle Review', parentId: 'bundle' },
    { id: 'bundle/curation', name: 'Bundle Curation', parentId: 'bundle' },
  ] }));
  const scenarios = [
    { slug: 'renames-in-review', areas: ['bundle/sourcing', 'bundle/review'], categories: ['rename'] },
    { slug: 'renames-without-review', areas: ['bundle/sourcing'], categories: ['rename'] },
    { slug: 'adds-in-review', areas: ['bundle/sourcing', 'bundle/review'], categories: ['add'] },
    { slug: 'review-only', areas: ['bundle/review'], categories: [] },
    { slug: 'curation-only', areas: ['bundle/curation'], categories: [] },
  ].map(scenario => ({ slug: scenario.slug, testName: scenario.slug, status: 'passed', duration: 1,
    bundleMode: 'single-file', executionSurface: 'browser', conceptIds: [], appAreaDocIds: scenario.areas,
    subAreaDocIds: [], sourceChangeCategories: scenario.categories, bundleDocIds: [], keyFrames: [], hasIssues: false }));
  await page.route('**/api/runs/filter-mix', route => route.fulfill({ json: { runId: 'filter-mix', scenarios } }));
  await page.route('**/api/runs/filter-mix/health', route => route.fulfill({ json: {} }));
  await page.goto('/filter-mix?view=list');
});

async function expectScenarios(page: Page, names: string[]) {
  await expect(page.getByRole('link', { name: /^PASS / })).toHaveText(names.map(name => new RegExp(`PASS\\s*${name}\\s*1\\.0s`)));
}

async function selectRenamedSourcingInReview(page: Page) {
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await areas.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('group', { name: 'Source changes', exact: true }).getByRole('button', { name: 'rename', exact: true }).click();
  // Plain pills: Sourcing or Review, and a rename.
  await expectScenarios(page, ['renames without review', 'renames in review']);
}

// One row's pills can be required together, the mix is kept in the URL, and
// a mix that comes back to the plain meaning returns to plain parameters.
test('a row can require all of its pills and the mix survives a reload', async ({ page }) => {
  const mix = page.getByRole('region', { name: 'Filter mix' });
  await selectRenamedSourcingInReview(page);
  await mix.getByRole('button', { name: /Mix filters/ }).click();
  await expect(mix.getByLabel('Expression')).toHaveValue('all(any(area:bundle/sourcing, area:bundle/review), any(sourcechange:rename))');
  await expect(mix.getByText('Customized')).toHaveCount(0);

  await mix.getByRole('group', { name: 'How parentheses 1 combines' }).getByRole('button', { name: 'All', exact: true }).click();
  await expectScenarios(page, ['renames in review']);
  await expect(mix.getByText('Customized')).toBeVisible();
  await expect(page).toHaveURL(/[?&]mix=/);
  await expect(page).not.toHaveURL(/[?&]area=/);

  await page.reload();
  await expectScenarios(page, ['renames in review']);
  await expect(mix.getByLabel('Expression')).toHaveValue('all(all(area:bundle/sourcing, area:bundle/review), any(sourcechange:rename))');
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  await expect(areas.getByRole('button', { name: 'Review', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Curation would add nothing to this mix, so it is tucked away.
  await expect(areas.getByRole('button', { name: 'Curation', exact: true })).toHaveCount(0);

  await areas.getByRole('button', { name: 'Review', exact: true }).click();
  await expectScenarios(page, ['renames without review', 'renames in review']);
  await expect(mix.getByText('Customized')).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]mix=/);
  await expect(page).toHaveURL(/[?&]area=bundle%2Fsourcing/);
});

// Typed mixes nest parentheses and Without; mistakes are reported in place.
test('typed mixes nest groups and report text they cannot read', async ({ page }) => {
  const mix = page.getByRole('region', { name: 'Filter mix' });
  await mix.getByRole('button', { name: /Mix filters/ }).click();
  const expression = mix.getByLabel('Expression');
  await expression.fill('without(any(area:bundle/review, area:bundle/curation), sourcechange:add)');
  await expression.press('Enter');
  await expectScenarios(page, ['review only', 'renames in review', 'curation only']);
  await expect(page.getByRole('group', { name: 'Source changes', exact: true }).getByRole('button', { name: 'add', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(mix.getByRole('group', { name: 'Parentheses 1' }).getByText('Area: Bundle Curation')).toBeVisible();

  await expression.fill('all(area:bundle/review');
  await mix.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(mix.getByRole('alert')).toHaveText('Expected ")" at character 23.');
  await expectScenarios(page, ['review only', 'renames in review', 'curation only']);

  await page.goto('/filter-mix?view=list&mix=all(sourcechange:renamed)');
  await expect(mix.getByRole('alert').first()).toContainText('Unknown sourcechange "renamed"');
  await expect(mix.getByLabel('Expression')).toHaveValue('all(sourcechange:renamed)');
  await expectScenarios(page, ['review only', 'renames without review', 'renames in review', 'curation only', 'adds in review']);
});

// Pills dragged into new parentheses change what the mix requires.
test('dragging a pill into new parentheses regroups the mix', async ({ page }) => {
  const mix = page.getByRole('region', { name: 'Filter mix' });
  await selectRenamedSourcingInReview(page);
  await mix.getByRole('button', { name: /Mix filters/ }).click();
  const whole = mix.getByRole('group', { name: 'Whole mix' });
  await whole.getByRole('button', { name: '+ Add parentheses' }).last().click();
  await expect(mix.getByText('Drop filters here')).toBeVisible();

  await mix.getByText('Area: Bundle Review', { exact: true }).hover();
  await page.mouse.down();
  await mix.getByText('Drop filters here').hover();
  await page.mouse.up();
  await expect(mix.getByLabel('Expression')).toHaveValue('all(any(area:bundle/sourcing), any(sourcechange:rename), any(area:bundle/review))');
  await expectScenarios(page, ['renames in review']);
  await expect(mix.getByText('Customized')).toBeVisible();

  await mix.getByRole('button', { name: 'Reset mix' }).click();
  await expectScenarios(page, ['renames without review', 'renames in review']);
  await expect(page).not.toHaveURL(/[?&]mix=/);
});
