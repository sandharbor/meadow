/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('captured documents connect pressure, area, prose, backlinks and explicit scenario evidence', async ({ page, request }, testInfo) => {
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-pressure-'));
  const runId = path.basename(run);
  const catalog = await (await request.get('/api/documents')).json();
  const pressureId = 'prevent-accidental-sharing';
  const pressureName = 'Prevent accidental sharing of sensitive material';
  const cases = [
    { scenarioId: 'passed', status: 'passed', appAreaDocIds: ['bundle/sourcing'], designPressureIds: [pressureId] },
    { scenarioId: 'failed', status: 'failed', appAreaDocIds: ['bundle/curation'], designPressureIds: [pressureId] },
    { scenarioId: 'skipped', status: 'skipped', appAreaDocIds: ['bundle/sourcing'], designPressureIds: [pressureId] },
    { scenarioId: 'incidental', status: 'passed', appAreaDocIds: ['bundle/sourcing'], designPressureIds: [] },
  ];
  for (const scenario of cases) {
    const directory = path.join(run, scenario.scenarioId);
    mkdirSync(directory);
    const info = { ...scenario, testName: `Example ${scenario.scenarioId}`, nameText: { segments: [{ kind: 'text', text: `Readable example ${scenario.scenarioId}` }] }, duration: 1, executionSurface: 'browser',
      conceptIds: ['sensitive'], subAreaDocIds: [], bundleDocIds: [], keyFrames: [] };
    writeFileSync(path.join(directory, 'status.txt'), scenario.status);
    writeFileSync(path.join(directory, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ ...info, logs: [], homeCommits: [], homeCommitMeta: [], minioCommitMeta: [], ticks: [], uncommittedEntries: [] }));
  }
  const snapshot = { ...catalog, version: 1, capturedAt: new Date().toISOString(),
    documents: catalog.documents.map((document: { id: string; descriptionText: unknown }) => ({ ...document, description: document.descriptionText,
      ...(document.id === 'sensitive' ? { name: 'Captured sensitive page' } : {}) })),
    scenarios: [...cases, { scenarioId: 'absent', designPressureIds: [pressureId] }].map(scenario => ({ ...scenario,
      testFile: `${scenario.scenarioId}.spec.ts`, conceptIds: ['sensitive'], bundleDocIds: [], subAreaDocIds: [], appAreaDocIds: [] })),
  };
  writeFileSync(path.join(run, 'documents.json'), JSON.stringify(snapshot));
  try {
    await page.goto(`/${runId}?view=details&surface=browser`);
    const row = page.getByRole('region', { name: 'Design pressures', exact: true });
    await expect(row).toBeHidden();
    await page.getByText('Browse docs', { exact: true }).click();
    await page.getByRole('tab', { name: 'Design pressures', exact: true }).click();
    for (const status of ['passed', 'failed', 'skipped']) await expect(row).toContainText(`1 ${status}`);
    await expect(row).toContainText('1 declared, not run');
    const originalUrl = page.url();
    await page.getByRole('tab', { name: 'App areas', exact: true }).click();
    const sourcing = page.getByRole('region', { name: 'Bundle Sourcing documents', exact: true });
    const curation = page.getByRole('region', { name: 'Bundle Curation documents', exact: true });
    await expect(sourcing.getByRole('button', { name: 'Proposal Tracking Sensitivity', exact: true })).toBeVisible();
    await expect(curation.getByRole('button', { name: 'Proposal Tracking Sensitivity', exact: true })).toBeVisible();
    await expect(curation.getByRole('button', { name: 'Captured sensitive page', exact: true })).toBeVisible();
    await expect(sourcing.getByRole('button', { name: 'Captured sensitive page', exact: true })).toHaveCount(0);
    await expect(sourcing.getByRole('button', { name: 'Source Review Workspace', exact: true }).locator('..')).toContainText('(workflow sub-area)');
    await page.getByRole('tab', { name: 'Design pressures', exact: true }).click();
    await row.getByRole('button', { name: pressureName, exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
    await expect(panel.getByRole('heading', { name: pressureName, exact: true })).toBeVisible();
    await expect(panel.getByLabel('Document metadata')).toContainText('design pressure');
    await expect(panel.getByLabel('Document metadata').getByRole('link')).toHaveCount(4);
    const areaStrip = panel.getByRole('group', { name: 'Document app areas', exact: true });
    await expect(areaStrip.locator('[data-area-id]')).toHaveText(['Bundles', 'Sourcing', 'Curation', 'Generation', 'Review', 'Sharing']);
    await expect(areaStrip.locator('[data-area-id="bundles"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(areaStrip.locator('[data-area-id="bundle/review"]')).toHaveAttribute('data-applicable', 'false');
    await expect(areaStrip.getByRole('link', { name: 'Generation', exact: true })).toHaveAttribute('href', `/concepts/bundle%2Fgeneration?run=${runId}`);
    await expect(panel).toContainText('Documentation captured with this run.');
    await expect(panel.getByLabel('3 related scenarios')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('design-pressure.png'), fullPage: true });
    await panel.getByText('Related scenarios (3)', { exact: true }).click();
    const evidence = panel.getByRole('region', { name: 'Scenario evidence', exact: true });
    await expect(evidence.getByRole('link', { name: 'Readable example passed', exact: true })).toBeVisible();
    await expect(evidence).toContainText('Not run (skipped)');
    await expect(evidence).toContainText('Declared, not run (1)');
    await panel.getByRole('region', { name: 'How the design responds', exact: true }).getByRole('link', { name: 'Sensitive Bundle Page', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Captured sensitive page', exact: true })).toBeVisible();
    await expect(panel.getByLabel('Document metadata').getByRole('link')).toHaveCount(1);
    await expect(panel.getByRole('region', { name: 'Referenced by', exact: true })).toContainText(pressureName);
    await expect(panel.getByLabel('4 related scenarios')).toBeVisible();
    await expect(page).toHaveURL(originalUrl);
    const [documentPage] = await Promise.all([page.waitForEvent('popup'), panel.getByRole('link', { name: 'Open in new page', exact: true }).click()]);
    await expect(documentPage).toHaveURL(new RegExp(`run=${runId}`));
    await expect(documentPage.getByRole('heading', { name: 'Captured sensitive page', exact: true })).toBeVisible();
    await documentPage.close();
    await row.getByRole('button', { name: 'Select scenarios (3)', exact: true }).click();
    await expect(page).toHaveURL(/pressure=prevent-accidental-sharing/);
    await expect(page.getByRole('article', { name: 'Example incidental', exact: true })).toHaveCount(0);
    await expect(page.getByRole('article', { name: 'Example passed', exact: true })).toBeVisible();
    await page.reload();
    await page.getByText('Browse docs', { exact: true }).click();
    await page.getByRole('tab', { name: 'Design pressures', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Select scenarios (3)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: pressureName, exact: true }).click();
    await panel.getByRole('link', { name: /Select related scenarios/ }).click();
    await expect(page).toHaveURL(/surface=browser/);
    await expect(page).toHaveURL(/pressure=prevent-accidental-sharing/);
    await expect(page.getByRole('article', { name: 'Example incidental', exact: true })).toHaveCount(0);
    // A corrupt new capture is an error, never a silent substitution of current prose.
    writeFileSync(path.join(run, 'documents.json'), '{broken');
    expect((await request.get(`/api/documents?run=${runId}`)).status()).toBe(500);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Could not read the document catalog');
    // Historical runs remain readable and distinguish unavailable associations from explicit [].
    rmSync(path.join(run, 'documents.json'));
    const legacy = await (await request.get(`/api/documents?run=${runId}`)).json();
    expect(legacy.provenance).toBe('current-fallback');
    await page.goto(`/concepts/sensitive?run=${runId}`);
    await expect(page.getByText('Current documentation · this older run has no captured document catalog.', { exact: true })).toBeVisible();
    const general = catalog.documents.find((document: { documentKind: string; appAreaIds?: string[] }) => document.documentKind === 'fixture' && !document.appAreaIds?.length);
    await page.goto(`/concepts/${general.id}?run=${runId}`);
    await expect(page.getByLabel('Document metadata')).toContainText('App areas: General');
  } finally {
    await page.goto('about:blank');
    rmSync(run, { recursive: true, force: true });
  }
});
