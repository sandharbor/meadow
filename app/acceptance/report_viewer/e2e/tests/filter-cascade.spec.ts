/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { URL, URLSearchParams } from 'node:url';

test.beforeEach(async ({ page }) => {
  const concepts = [
    ['snapshot', 'Source Snapshot'], ['filter', 'Custom Filter'], ['images', 'Images'],
    ['move', 'Source Move'], ['selection', 'Page Selection'], ['unused', 'Unused Category'],
    ['common', 'Common Category'], ['contributed-source', 'Contributed Sourcing'],
    ['contributed-folder', 'Contributed Folder'],
  ].map(([id, name]) => ({ id, name, description: name, searchFacet: true, isContribution: id.startsWith('contributed-') }));
  const scenarios = [
    { slug: 'big-file-sourcing', bundle: 'big', mode: 'single-file', area: 'sourcing', concepts: ['snapshot', 'contributed-source'] },
    { slug: 'big-folder-curation', bundle: 'big', mode: 'single-folder', area: 'curation', concepts: ['filter'] },
    { slug: 'small-file-curation', bundle: 'small', mode: 'single-file', area: 'curation', concepts: ['images'], surface: 'cli' },
    { slug: 'small-folder-sourcing', bundle: 'small', mode: 'single-folder', area: 'sourcing', concepts: ['move', 'contributed-folder'] },
    { slug: 'big-file-curation', bundle: 'big', mode: 'single-file', area: 'curation', concepts: ['selection'] },
    { slug: 'small-mixed-sharing', bundle: 'small', mode: 'mixed-starts', area: 'sharing', concepts: ['images'] },
  ].map(scenario => ({
    slug: scenario.slug, testName: scenario.slug, status: 'passed', duration: 1,
    description: `Description of ${scenario.slug}.`,
    bundleMode: scenario.mode, executionSurface: scenario.surface ?? 'browser', conceptIds: [...scenario.concepts, 'common'],
    appAreaDocIds: [scenario.area], bundleDocIds: [scenario.bundle], keyFrames: [], hasIssues: false,
  }));
  await page.route('**/api/concepts', route => route.fulfill({ json: concepts }));
  await page.route('**/api/bundle-docs', route => route.fulfill({ json: [
    { id: 'big', name: 'Big Bundle', description: 'Big fixture' },
    { id: 'small', name: 'Small Bundle', description: 'Small fixture' },
  ] }));
  await page.route('**/api/app-areas', route => route.fulfill({ json: [
    { id: 'sourcing', name: 'Bundle Sourcing', parentId: 'bundle', description: 'Sourcing area' },
    { id: 'curation', name: 'Bundle Curation', parentId: 'bundle', description: 'Curation area' },
    { id: 'sharing', name: 'Bundle Sharing', parentId: 'bundle', description: 'Sharing area' },
  ] }));
  for (const runId of ['filter-cascade', 'filter-cascade-other']) {
    await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: { runId, scenarios } }));
    await page.route(`**/api/runs/${runId}/health`, route => route.fulfill({ json: {} }));
  }
  await page.goto('/filter-cascade?view=list');
});

test('filter rows narrow together and unavailable tags can be shown and hidden', async ({ page }) => {
  const bundles = page.getByRole('group', { name: 'Bundles', exact: true });
  const modes = page.getByRole('group', { name: 'Starts with', exact: true });
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  const contributions = page.getByRole('group', { name: 'Contributed concept filters', exact: true });
  await expect(bundles.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const allColumn = (await bundles.getByRole('button', { name: 'All', exact: true }).boundingBox())!;
  for (const row of [page.getByRole('group', { name: 'Interface', exact: true }), bundles, modes, areas, concepts, contributions]) {
    const box = (await row.getByRole('button', { name: 'All', exact: true }).boundingBox())!;
    expect(box.x).toBe(allColumn.x);
    expect(box.width).toBe(allColumn.width);
  }
  expect((await bundles.boundingBox())!.y).toBeLessThan((await modes.boundingBox())!.y);
  await expect(modes.getByRole('button', { name: 'Mixed starting selections', exact: true })).toBeVisible();
  await bundles.getByRole('button', { name: 'Big Bundle', exact: true }).click();
  await expect(modes.getByRole('button', { name: /^Mixed starting selections/ })).toHaveCount(0);
  await modes.getByRole('button', { name: 'and 2 hidden', exact: true }).click();
  await expect(modes.getByRole('button', { name: 'Mixed starting selections', exact: true })).toBeVisible();
  await modes.getByRole('button', { name: 'hide', exact: true }).click();
  await modes.getByRole('button', { name: 'Single file', exact: true }).click();
  await expect(areas.getByRole('button', { name: 'Sharing', exact: true })).toHaveCount(0);
  await areas.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await expect(areas.getByRole('button', { name: 'Sharing', exact: true })).toBeVisible();
  await areas.getByRole('button', { name: 'hide', exact: true }).click();
  await areas.getByRole('button', { name: 'Sourcing', exact: true }).click();
  await expect(page.getByText('Sourcing area', { exact: true })).toHaveCount(0);
  await expect(areas.getByRole('button', { name: 'Sourcing', exact: true })).not.toHaveAttribute('title');

  await expect(concepts.getByRole('button', { name: 'Source Snapshot', exact: true })).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Common Category', exact: true })).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Images', exact: true })).toHaveCount(0);
  await expect(concepts.getByRole('button', { name: 'Custom Filter', exact: true })).toHaveCount(0);
  await expect(concepts.getByRole('button', { name: 'Page Selection', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'small folder sourcing' })).toHaveCount(0);

  const originalUrl = page.url();
  const expand = concepts.getByRole('button', { name: 'and 5 hidden', exact: true });
  const togglePosition = (await expand.boundingBox())!;
  await expand.click();
  const collapse = concepts.getByRole('button', { name: 'hide', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  expect(await collapse.boundingBox()).toEqual(togglePosition);
  const images = concepts.getByRole('button', { name: 'Images', exact: true });
  await expect(images).toBeVisible();
  await expect(images).toHaveCSS('color', 'rgb(148, 163, 184)');
  const imagesPosition = (await images.boundingBox())!;
  expect(imagesPosition.y > togglePosition.y || imagesPosition.x > togglePosition.x + togglePosition.width).toBe(true);
  await page.mouse.click(togglePosition.x + togglePosition.width / 2, togglePosition.y + togglePosition.height / 2);
  await expect(images).toHaveCount(0);
  await expect(concepts.getByRole('button', { name: 'and 5 hidden', exact: true })).toHaveAttribute('aria-expanded', 'false');
  expect(page.url()).toBe(originalUrl);

  await expect(contributions.getByRole('button', { name: 'Contributed Sourcing', exact: true })).toBeVisible();
  await expect(contributions.getByRole('button', { name: 'All', exact: true })).toHaveCSS('color', 'rgb(203, 213, 225)');
  expect((await contributions.getByRole('button', { name: 'All', exact: true }).boundingBox())!.x).toBe(allColumn.x);
  await expect(contributions.getByRole('button', { name: 'Contributed Folder', exact: true })).toHaveCount(0);
  await contributions.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await expect(contributions.getByRole('button', { name: 'Contributed Folder', exact: true })).toBeVisible();
  await contributions.getByRole('button', { name: 'hide', exact: true }).click();

  await expect(bundles.getByRole('button', { name: 'All', exact: true })).toHaveCSS('color', 'rgb(203, 213, 225)');
  await bundles.getByRole('button', { name: 'All', exact: true }).click();
  await expect(bundles.getByRole('button', { name: 'Big Bundle', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // The mode and area selections still constrain the concepts after clearing bundles.
  await expect(concepts.getByRole('button', { name: 'Source Move', exact: true })).toHaveCount(0);
  await modes.getByRole('button', { name: 'All', exact: true }).click();
  await expect(concepts.getByRole('button', { name: 'Source Move', exact: true })).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Custom Filter', exact: true })).toHaveCount(0);
  await areas.getByRole('button', { name: 'All', exact: true }).click();
  await expect(concepts.getByRole('button', { name: 'Custom Filter', exact: true })).toBeVisible();
});

test('unavailable selections stay visible and removable after changing another filter', async ({ page }) => {
  const bundles = page.getByRole('group', { name: 'Bundles', exact: true });
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  const snapshot = concepts.getByRole('button', { name: 'Source Snapshot', exact: true });
  await snapshot.click();
  await bundles.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await bundles.getByRole('button', { name: 'Small Bundle', exact: true }).click();
  await page.reload();
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute('aria-pressed', 'true');
  await expect(snapshot).toHaveAttribute('title', /No matching scenarios/);
  await snapshot.click();
  await expect(snapshot).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'small file curation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toHaveCount(0);
  await bundles.getByRole('button', { name: 'Big Bundle', exact: true }).click();
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'small file curation' })).toBeVisible();
});

test('tag rows default to All and clear their own selections independently', async ({ page }) => {
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  const contributions = page.getByRole('group', { name: 'Contributed concept filters', exact: true });
  const allTags = concepts.getByRole('button', { name: 'All', exact: true });
  const allContributions = contributions.getByRole('button', { name: 'All', exact: true });
  const common = concepts.getByRole('button', { name: 'Common Category', exact: true });
  const contributed = contributions.getByRole('button', { name: 'Contributed Folder', exact: true });
  await expect(allTags).toHaveAttribute('aria-pressed', 'true');
  await expect(allContributions).toHaveAttribute('aria-pressed', 'true');

  await common.click();
  await expect(allContributions).toHaveAttribute('aria-pressed', 'true');
  await contributed.click();
  await allContributions.click();
  await expect(allContributions).toHaveAttribute('aria-pressed', 'true');
  await expect(contributed).toHaveAttribute('aria-pressed', 'false');
  await expect(common).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toBeVisible();

  await contributed.click();
  await allTags.click();
  await expect(allTags).toHaveAttribute('aria-pressed', 'true');
  await expect(common).toHaveAttribute('aria-pressed', 'false');
  await expect(contributed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'small folder sourcing' })).toBeVisible();

  await allContributions.click();
  await expect(page.getByRole('link', { name: 'big file sourcing' })).toBeVisible();
});

test('both tag rows show co-occurring tags from the selected scenarios', async ({ page }) => {
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  const contributions = page.getByRole('group', { name: 'Contributed concept filters', exact: true });
  const snapshot = concepts.getByRole('button', { name: 'Source Snapshot', exact: true });
  const images = concepts.getByRole('button', { name: 'Images', exact: true });
  const sourceContribution = contributions.getByRole('button', { name: 'Contributed Sourcing', exact: true });
  const folderContribution = contributions.getByRole('button', { name: 'Contributed Folder', exact: true });

  await snapshot.click();
  await expect(concepts.getByRole('button', { name: 'Common Category', exact: true })).toBeVisible();
  await expect(images).toHaveCount(0);
  await expect(sourceContribution).toBeVisible();
  await expect(folderContribution).toHaveCount(0);
  await concepts.getByRole('button', { name: 'and 5 hidden', exact: true }).click();
  await expect(images).toHaveCSS('color', 'rgb(148, 163, 184)');
  await concepts.getByRole('button', { name: 'hide', exact: true }).click();
  await expect(images).toHaveCount(0);

  await snapshot.click();
  await folderContribution.click();
  await expect(concepts.getByRole('button', { name: 'Source Move', exact: true })).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Common Category', exact: true })).toBeVisible();
  await expect(snapshot).toHaveCount(0);
  await expect(sourceContribution).toHaveCount(0);
  await contributions.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await expect(sourceContribution).toHaveCSS('color', 'rgb(148, 163, 184)');
  await contributions.getByRole('button', { name: 'hide', exact: true }).click();
  await expect(folderContribution).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'small folder sourcing' })).toBeVisible();
});

test('each row remembers its expanded or collapsed preference across reloads and reports', async ({ page }) => {
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  await concepts.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await concepts.getByRole('button', { name: 'Unused Category', exact: true }).click();

  const expandedRows = ['Interface', 'Areas', 'Concept filters', 'Contributed concept filters'];
  const collapsedRows = ['Bundles', 'Starts with'];
  for (const name of expandedRows.filter(name => name !== 'Concept filters')) {
    await page.getByRole('group', { name, exact: true }).getByRole('button', { name: /^\d+ hidden$/ }).click();
  }
  await page.reload();
  for (const name of [...expandedRows, ...collapsedRows]) {
    const row = page.getByRole('group', { name, exact: true });
    await expect(row.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', String(expandedRows.includes(name)));
    await row.locator('button[aria-expanded]').click();
  }

  await page.goto('/filter-cascade-other?view=list&doc=unused');
  for (const name of [...expandedRows, ...collapsedRows]) {
    const row = page.getByRole('group', { name, exact: true });
    await expect(row.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', String(collapsedRows.includes(name)));
  }
});

test('concept and area choices also narrow rows above them, including the interface', async ({ page }) => {
  const surfaces = page.getByRole('group', { name: 'Interface', exact: true });
  const bundles = page.getByRole('group', { name: 'Bundles', exact: true });
  const modes = page.getByRole('group', { name: 'Starts with', exact: true });
  const areas = page.getByRole('group', { name: 'Areas', exact: true });
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  await expect(surfaces.getByRole('button', { name: 'CLI', exact: true })).toBeVisible();
  for (const row of [surfaces, bundles, modes, areas]) {
    await expect(row.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  }
  await concepts.getByRole('button', { name: 'Source Snapshot', exact: true }).click();
  for (const row of [surfaces, bundles, modes, areas]) {
    await expect(row.getByRole('button', { name: 'All', exact: true })).toHaveCSS('color', 'rgb(203, 213, 225)');
    await expect(row.getByRole('button', { name: /^and \d+ hidden$/ })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(bundles.getByRole('button', { name: 'Big Bundle', exact: true })).toBeVisible();
  await expect(bundles.getByRole('button', { name: 'Small Bundle', exact: true })).toHaveCount(0);
  await expect(modes.getByRole('button', { name: 'Single file', exact: true })).toBeVisible();
  await expect(modes.getByRole('button', { name: /^Single folder/ })).toHaveCount(0);
  await expect(areas.getByRole('button', { name: 'Sourcing', exact: true })).toBeVisible();
  await expect(areas.getByRole('button', { name: 'Curation', exact: true })).toHaveCount(0);
  await expect(surfaces.getByRole('button', { name: 'Browser', exact: true })).toBeVisible();
  await expect(surfaces.getByRole('button', { name: /^CLI/ })).toHaveCount(0);
  await surfaces.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await expect(surfaces.getByRole('button', { name: 'CLI', exact: true })).toHaveCSS('color', 'rgb(148, 163, 184)');
  await expect(surfaces.getByRole('button', { name: /^All/ })).toHaveCSS('color', 'rgb(203, 213, 225)');
  await surfaces.getByRole('button', { name: 'hide', exact: true }).click();
  const browser = surfaces.getByRole('button', { name: 'Browser', exact: true });
  await browser.click();
  await expect(browser).toHaveAttribute('aria-pressed', 'true');
  await browser.click();
  await expect(browser).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/[?&]surface=/);

  await concepts.getByRole('button', { name: 'All', exact: true }).click();
  await areas.getByRole('button', { name: 'Sharing', exact: true }).click();
  await expect(bundles.getByRole('button', { name: 'Small Bundle', exact: true })).toBeVisible();
  await expect(bundles.getByRole('button', { name: 'Big Bundle', exact: true })).toHaveCount(0);
  await expect(modes.getByRole('button', { name: 'Mixed starting selections', exact: true })).toBeVisible();
  await expect(modes.getByRole('button', { name: /^Single file/ })).toHaveCount(0);
  await expect(concepts.getByRole('button', { name: 'Images', exact: true })).toBeVisible();
  await expect(concepts.getByRole('button', { name: 'Source Snapshot', exact: true })).toHaveCount(0);
  await areas.getByRole('button', { name: 'All', exact: true }).click();
  await expect(bundles.getByRole('button', { name: 'Big Bundle', exact: true })).toBeVisible();
  await expect(modes.getByRole('button', { name: 'Single folder', exact: true })).toBeVisible();
});

test('rows with no available choices keep a muted All beside their hidden count', async ({ page }) => {
  const concepts = page.getByRole('group', { name: 'Concept filters', exact: true });
  await concepts.getByRole('button', { name: 'and 1 hidden', exact: true }).click();
  await concepts.getByRole('button', { name: 'Unused Category', exact: true }).click();

  for (const [name, count] of [['Interface', 2], ['Bundles', 2], ['Starts with', 4], ['Areas', 3]] as const) {
    const row = page.getByRole('group', { name, exact: true });
    const toggle = row.getByRole('button', { name: `${count} hidden`, exact: true });
    await expect(row.getByRole('button')).toHaveCount(2);
    await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await toggle.click();
    await expect(row.getByRole('button', { name: 'All', exact: true })).toHaveCSS('color', 'rgb(203, 213, 225)');
    await expect(row.locator('button[aria-pressed]')).toHaveCount(count + 1);
    await row.getByRole('button', { name: 'hide', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row.getByRole('button')).toHaveCount(2);
  }

  await concepts.getByRole('button', { name: 'Unused Category', exact: true }).click();
  await page.getByRole('group', { name: 'Areas', exact: true }).getByRole('button', { name: 'Curation', exact: true }).click();
  const contributions = page.getByRole('group', { name: 'Contributed concept filters', exact: true });
  await expect(contributions.getByRole('button')).toHaveCount(2);
  await contributions.getByRole('button', { name: '2 hidden', exact: true }).click();
  await expect(contributions.getByRole('button', { name: 'All', exact: true })).toHaveCSS('color', 'rgb(203, 213, 225)');
  await expect(contributions.locator('button[aria-pressed]')).toHaveCount(3);
  await contributions.getByRole('button', { name: 'hide', exact: true }).click();
  await expect(contributions.getByRole('button', { name: '2 hidden', exact: true })).toBeVisible();
});

test('Details shows each scenario’s metadata under its description and mirrors filter selections', async ({ page }) => {
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const scenario = page.getByRole('article', { name: 'big file sourcing', exact: true });
  const metadata = scenario.locator('dl[aria-label="Scenario metadata"]');
  await expect(metadata).toBeVisible();
  expect((await metadata.boundingBox())!.y).toBeGreaterThan((await scenario.getByText('Description of big-file-sourcing.').boundingBox())!.y);
  await expect(metadata.getByText('Common Category', { exact: true })).toBeVisible();
  await expect(metadata.getByText('Custom Filter', { exact: true })).toHaveCount(0);
  await expect(metadata.getByText('All', { exact: true })).toHaveCount(0);

  for (const [group, name] of [
    ['Interface', 'Browser'], ['Areas', 'Sourcing'], ['Bundles', 'Big Bundle'],
    ['Starts with', 'Single file'], ['Concept filters', 'Source Snapshot'],
    ['Contributed concept filters', 'Contributed Sourcing'],
  ]) {
    const badge = metadata.getByText(name, { exact: true });
    await expect(badge).toHaveAttribute('data-selected', 'false');
    const filter = page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true });
    await filter.click();
    await expect(badge).toHaveAttribute('data-selected', 'true');
    await expect(filter).toHaveCSS('background-color', await badge.evaluate(element => globalThis.getComputedStyle(element).backgroundColor));
    await expect(badge).toHaveCSS('outline', await filter.evaluate(element => globalThis.getComputedStyle(element).outline));
    await expect(badge).toHaveCSS('opacity', '1');
  }

  await page.getByRole('group', { name: 'Concept filters', exact: true }).getByRole('button', { name: 'All', exact: true }).click();
  await expect(metadata.getByText('Source Snapshot', { exact: true })).toHaveAttribute('data-selected', 'false');
  await expect(metadata.getByText('Source Snapshot', { exact: true })).toHaveCSS('outline-style', 'none');
  await expect(metadata.getByText('Contributed Sourcing', { exact: true })).toHaveAttribute('data-selected', 'true');
});

test('metadata pills can add to existing filters or restart with just the chosen value', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/filter-cascade?view=details&doc=common');
  const scenario = page.getByRole('article', { name: 'big file sourcing', exact: true });
  const metadata = scenario.locator('dl[aria-label="Scenario metadata"]');
  const selections = [
    ['Browser', 'surface', 'browser'], ['Sourcing', 'area', 'sourcing'], ['Big Bundle', 'bundle', 'big'],
    ['Single file', 'mode', 'single-file'], ['Source Snapshot', 'doc', 'snapshot'],
    ['Contributed Sourcing', 'doc', 'contributed-source'],
  ];
  const accumulated = new URLSearchParams('view=details&doc=common');
  for (const [name, key, value] of selections) {
    await metadata.getByRole('button', { name, exact: true }).click();
    const menu = page.getByRole('menu', { name: `Filter by ${name}`, exact: true });
    await expect(menu.getByRole('menuitem')).toHaveText(['add to current', 'restart with this', 'cancel']);
    await menu.getByRole('menuitem', { name: 'add to current', exact: true }).click();
    accumulated.append(key, value);
    expect([...new URL(page.url()).searchParams].sort()).toEqual([...accumulated].sort());
    await expect(menu).toHaveCount(0);
    await expect(metadata.getByRole('button', { name, exact: true })).toHaveAttribute('data-selected', 'true');
  }

  // Adding a selected pill keeps it selected without duplicating the URL filter.
  const beforeDuplicate = page.url();
  await metadata.getByRole('button', { name: 'Source Snapshot', exact: true }).click();
  await page.getByRole('menuitem', { name: 'add to current', exact: true }).click();
  expect(page.url()).toBe(beforeDuplicate);

  for (const [name, key, value] of selections) {
    await page.goto(`/filter-cascade?${accumulated}`);
    await metadata.getByRole('button', { name, exact: true }).click();
    await page.getByRole('menuitem', { name: 'restart with this', exact: true }).click();
    expect([...new URL(page.url()).searchParams].sort()).toEqual([['view', 'details'], [key, value]].sort());
    await expect(scenario).toBeVisible();
  }
});

test('the pill menu stays by its pill and supports cancel, Escape, outside clicks, and keyboard actions', async ({ page }) => {
  test.setTimeout(30_000);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const scenario = page.getByRole('article', { name: 'big file sourcing', exact: true });
  const pill = scenario.getByRole('button', { name: 'Source Snapshot', exact: true });
  const menu = page.getByRole('menu', { name: 'Filter by Source Snapshot', exact: true });
  const originalUrl = page.url();
  await pill.click();
  const pillBox = (await pill.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(Math.min(Math.abs(menuBox.y - pillBox.y - pillBox.height), Math.abs(pillBox.y - menuBox.y - menuBox.height))).toBeLessThanOrEqual(5);
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await menu.getByRole('menuitem', { name: 'cancel', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(pill).toBeFocused();
  expect(page.url()).toBe(originalUrl);

  await pill.press('Enter');
  await expect(menu.getByRole('menuitem', { name: 'add to current', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(pill).toBeFocused();
  expect(page.url()).toBe(originalUrl);

  await pill.click();
  await scenario.getByText('Description of big-file-sourcing.').click();
  await expect(menu).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);

  await pill.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'restart with this', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/view=details&doc=snapshot$/);
  await expect(menu).toHaveCount(0);
});
