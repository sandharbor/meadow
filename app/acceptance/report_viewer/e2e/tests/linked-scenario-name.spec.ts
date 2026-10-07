/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bridgeExclusion, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scopeExclusion } from '../../../../concepts/index.js';

test('captured scenario names open local concept details and select counted related scenarios', async ({ page, request }) => {
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-linked-name-'));
  const runId = path.basename(run);
  const nameText = conceptText`Acceptance cleans unreachable configuration for both ${conceptLink(scopeExclusion.id, 'scope exclusion')}s and external orphans`;
  const title = linkedScenarioName(nameText).name;
  const descriptionText = conceptText`Combine a staged ${conceptLink(bridgeExclusion.id, 'bridge exclusion')} with an external departure.`;
  const description = linkedScenarioDescription(descriptionText).description;
  const testSource = [
    '/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */',
    '',
    "import fs from 'node:fs';",
    "import { test } from './fixtures';",
    '',
    'test.use({ bundleMode: "single-file" });',
    'test.use({ fixtureHome: Fixture.SourcingReview });',
    'const name = linkedScenarioName(conceptText`Review ${conceptLink(scopeExclusion.id)}`);',
    '',
    "const description = linkedScenarioDescription(conceptText`Combine a staged ${conceptLink(bridgeExclusion.id, 'bridge exclusion')} with an external departure.`);",
    'test(name.name, { annotation: [name.annotation, description.annotation] }, async () => {',
    "  await sourceCommand(() => checkpoint('ready'));",
    '});',
  ].join('\n');
  for (const [slug, testName, conceptIds] of [
    ['linked-scenario', title, [scopeExclusion.id, bridgeExclusion.id]],
    ['other-related', 'Other related scenario', [scopeExclusion.id]],
    ['unrelated', 'Unrelated scenario', ['tracking']],
  ] as const) {
    const dir = path.join(run, slug);
    mkdirSync(dir);
    const info = { testName, nameText: slug === 'linked-scenario' ? nameText : undefined, description,
      descriptionText: slug === 'linked-scenario' ? descriptionText : undefined,
      executionSurface: 'cli', executionSurfaces: ['cli'], duration: 1, conceptIds,
      appAreaDocIds: [], bundleDocIds: [], keyFrames: [], status: 'passed' };
    writeFileSync(path.join(dir, 'status.txt'), 'passed');
    writeFileSync(path.join(dir, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...info,
      logs: [], homeCommits: [], homeCommitMeta: [], minioCommitMeta: [], ticks: [], uncommittedEntries: [], testSource, testSourceFixtures: [] }));
  }
  try {
    await page.goto('/');
    const headerDev = page.getByRole('banner').getByRole('link', { name: 'Open dev', exact: true });
    await expect(headerDev).toHaveAttribute('href', '/api/dev-tools/open');
    const response = await request.get(`/api/runs/${runId}`);
    const data = await response.json();
    expect(data.scenarios.find((item: { slug: string }) => item.slug === 'linked-scenario').nameText).toEqual(nameText);
    expect(data.scenarios.find((item: { slug: string }) => item.slug === 'linked-scenario').descriptionText).toEqual(descriptionText);
    await page.goto(`/${runId}?view=details`);
    await expect(headerDev).toBeVisible();
    const row = page.getByRole('article', { name: title, exact: true });
    await expect(row).toContainText(description);
    const descriptionBox = (await row.getByText(description, { exact: true }).boundingBox())!;
    const linked = row.getByRole('link', { name: 'scope exclusion', exact: true });
    expect((await linked.boundingBox())!.y).toBeLessThan(descriptionBox.y);
    await linked.click();
    await expect(page).toHaveURL(`/${runId}?view=details`);
    const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
    await expect(panel.getByRole('heading', { name: scopeExclusion.name, exact: true })).toBeVisible();
    await expect(panel.getByRole('combobox', { name: 'Concept display' })).toHaveCount(0);
    await expect(panel.getByRole('group', { name: 'Concept selection' })).toHaveCount(0);
    const select = panel.getByRole('link', { name: /Select related scenarios/ });
    await expect(select.getByLabel('2 related scenarios')).toHaveText('2');
    await expect(panel.getByText('Concept details and implementation', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('No implementation declared.', { exact: true })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Implemented by', exact: true })).toHaveCount(0);
    const header = panel.locator('[data-concept-panel-header]');
    await expect(header.getByRole('link', { name: /Select related scenarios/ })).toBeVisible();
    const openPage = header.getByRole('link', { name: 'Open in new page', exact: true });
    const selectBox = (await select.boundingBox())!;
    const openBox = (await openPage.boundingBox())!;
    expect(selectBox.y + selectBox.height / 2).toBe(openBox.y + openBox.height / 2);
    expect(selectBox.x).toBeLessThan(openBox.x);
    // Drag the header's empty padding, rather than the title or its small grip.
    const beforeDrag = (await panel.boundingBox())!;
    const headerBox = (await header.boundingBox())!;
    await page.mouse.move(headerBox.x + 6, headerBox.y + 4);
    await page.mouse.down();
    await page.mouse.move(headerBox.x - 34, headerBox.y + 24, { steps: 4 });
    await page.mouse.up();
    const afterDrag = (await panel.boundingBox())!;
    expect(afterDrag.x).toBe(beforeDrag.x - 40);
    expect(afterDrag.y).toBe(beforeDrag.y + 20);
    const [conceptPage] = await Promise.all([
      page.waitForEvent('popup'),
      panel.getByRole('link', { name: 'Open in new page', exact: true }).click(),
    ]);
    await expect(conceptPage).toHaveURL(/\/concepts\/scope-exclusion$/);
    await expect(conceptPage.getByRole('heading', { name: scopeExclusion.name, exact: true })).toBeVisible();
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(`/${runId}?view=details`);
    await conceptPage.close();
    await row.getByRole('link', { name: 'bridge exclusion', exact: true }).click();
    await expect(panel.getByRole('heading', { name: bridgeExclusion.name, exact: true })).toBeVisible();
    await expect(select.getByLabel('1 related scenarios')).toHaveText('1');
    await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();

    // The same captured link works on the individual scenario page.
    await page.goto(`/${runId}/linked-scenario`);
    await expect(headerDev).toHaveCount(0);
    const metadata = page.getByRole('region', { name: 'Scenario metadata', exact: true });
    await metadata.getByRole('button', { name: bridgeExclusion.name, exact: true }).click();
    await expect(page).toHaveURL(`/${runId}/linked-scenario`);
    await expect(panel.getByRole('heading', { name: bridgeExclusion.name, exact: true })).toBeVisible();
    await expect(panel.getByRole('combobox', { name: 'Concept display' })).toHaveCount(0);
    await expect(select.getByLabel('1 related scenarios')).toHaveText('1');
    await metadata.getByRole('button', { name: scopeExclusion.name, exact: true }).click();
    await expect(panel).toHaveCount(1);
    await expect(panel.getByRole('heading', { name: scopeExclusion.name, exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: bridgeExclusion.name, exact: true })).toHaveCount(0);
    await expect(select.getByLabel('2 related scenarios')).toHaveText('2');
    await select.click();
    await expect(page).toHaveURL(`/${runId}?doc=scope-exclusion`);
    await page.goto(`/${runId}/linked-scenario`);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText(description, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Test Code', exact: true }).click();
    const prose = page.getByRole('region', { name: 'Scenario name and description', exact: true });
    await expect(prose).toContainText(title);
    await expect(prose.getByText(description, { exact: true })).toBeVisible();
    expect(await prose.locator('..').evaluate(element => element.firstElementChild?.getAttribute('aria-label')))
      .toBe('Scenario name and description');
    await expect(page.locator('[data-source-line="1"]')).toHaveCount(0);
    await expect(page.locator('[data-source-line="3"]')).toHaveCount(0);
    const setupLine = page.locator('[data-source-line="6"]');
    await expect(setupLine).toContainText('test.use');
    expect((await setupLine.boundingBox())!.y).toBeGreaterThan((await prose.boundingBox())!.y + (await prose.boundingBox())!.height);
    await expect(page.locator('[data-source-line="7"]')).toContainText('fixtureHome');
    await page.evaluate(() => {
      Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
        (globalThis as typeof globalThis & { copiedScenarioContext?: string }).copiedScenarioContext = text;
      } } });
    });
    const copy = prose.getByRole('button', { name: 'Copy scenario name and description', exact: true });
    await copy.click();
    await expect(copy).toContainText('Copied');
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { copiedScenarioContext?: string }).copiedScenarioContext)).toBe(
      'For context, here is the copied name and description from E2E scenario linked-scenario\n\n'
      + 'Name: Acceptance cleans unreachable configuration for both [[scope exclusion]]s and external orphans\n\n'
      + 'Description: Combine a staged [[bridge exclusion]] with an external departure.\n\n--\n\n');
    expect((await prose.getByRole('link', { name: 'scope exclusion', exact: true }).boundingBox())!.y)
      .toBeLessThan((await prose.getByText(description, { exact: true }).boundingBox())!.y);
    await expect(page.locator('[data-source-line="8"]')).toHaveCount(0);
    await expect(page.locator('[data-source-line="10"]')).toHaveCount(0);
    await expect(page.locator('[data-source-line="11"]')).toContainText('test(name.name');
    await expect(panel).toHaveCount(0);
    await prose.getByRole('link', { name: 'bridge exclusion', exact: true }).click();
    await expect(panel).toHaveCount(1);
    await expect(panel.getByRole('heading', { name: bridgeExclusion.name, exact: true })).toBeVisible();
    await expect(select.getByLabel('1 related scenarios')).toHaveText('1');
    await expect(panel.getByRole('combobox', { name: 'Concept display' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
    await page.getByRole('checkbox', { name: 'show the real code', exact: true }).check();
    await expect(prose).toHaveCount(0);
    await expect(page.locator('[data-source-line="1"]')).toContainText('Copyright');
    await expect(page.locator('[data-source-line="3"]')).toContainText("import fs from 'node:fs'");
    await expect(page.locator('[data-source-line="8"]')).toContainText('const name = linkedScenarioName');
    await expect(page.locator('[data-source-line="10"]')).toContainText('const description = linkedScenarioDescription');
    await page.getByRole('checkbox', { name: 'show the real code', exact: true }).uncheck();
    await expect(prose.getByRole('link', { name: 'bridge exclusion', exact: true })).toBeVisible();
    await prose.getByRole('link', { name: 'scope exclusion', exact: true }).click();
    await expect(panel.getByRole('heading', { name: scopeExclusion.name, exact: true })).toBeVisible();
    await expect(select.getByLabel('2 related scenarios')).toBeVisible();
    await select.click();
    await expect(page).toHaveURL(`/${runId}?doc=scope-exclusion`);
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('article', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Other related scenario', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Unrelated scenario', exact: true })).toHaveCount(0);
    await page.goto('/concepts/runtime-service');
    const implementations = page.getByRole('region', { name: 'Implemented by', exact: true });
    await expect(implementations.getByRole('link').first()).toBeVisible();
    await expect(implementations.getByLabel('About implementation locations')).toHaveAttribute('title',
      'Locations are derived from inline participation declarations in the current checkout.');
    await expect(implementations.getByText('Locations are derived from inline participation declarations in the current checkout.', { exact: true })).toHaveCount(0);
  } finally {
    await page.goto('about:blank');
    rmSync(run, { recursive: true, force: true });
  }
});
