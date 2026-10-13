/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('documentation search and boundary lanes open current code and stable concept explanations without changing filters', async ({ page }, testInfo) => {
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-boundaries-'));
  const directory = path.join(run, 'example');
  mkdirSync(directory);
  const info = { scenarioId: 'example', testName: 'Boundary example', status: 'passed', duration: 1, executionSurface: 'browser',
    conceptIds: [], appAreaDocIds: ['bundle/sourcing'], subAreaDocIds: [], bundleDocIds: [], keyFrames: [] };
  writeFileSync(path.join(directory, 'status.txt'), 'passed');
  writeFileSync(path.join(directory, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ ...info, logs: [], homeCommits: [], homeCommitMeta: [], minioCommitMeta: [], ticks: [], uncommittedEntries: [] }));
  try {
    await page.goto(`/${path.basename(run)}?view=details&area=bundle%2Fsourcing`);
    await expect(page.getByRole('article', { name: 'Boundary example', exact: true })).toBeVisible();
    const originalUrl = page.url();
    await expect(page.getByLabel('Search documents')).toBeHidden();
    await expect(page.getByRole('region', { name: 'Area boundary swim lanes', exact: true })).toHaveCount(0);
    await page.getByText('Browse docs', { exact: true }).click();
    await page.getByLabel('Search documents').fill('reserved _mw_sources');
    const search = page.getByRole('tabpanel', { name: 'Document search results', exact: true });
    await expect(search.getByRole('button', { name: 'Bundle Node Key', exact: true })).toBeVisible();
    await page.getByLabel('Search documents').fill('nothing-matches-this-document');
    await expect(search).toContainText('0 matching documents');
    await page.getByLabel('Search documents').clear();
    await page.getByRole('tab', { name: 'Design pressures', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Design pressures', exact: true })).toBeVisible();
    await page.getByText('Browse docs', { exact: true }).click();
    await page.getByText('Area boundaries', { exact: true }).click();
    const lanes = page.getByRole('region', { name: 'Area boundary swim lanes', exact: true });
    await expect(lanes).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('boundary-map-overview.png'), fullPage: true });
    await page.getByLabel('Search area boundaries').fill('BundleNodeId');
    const types = lanes.getByLabel('Shared types', { exact: true });
    const identity = types.getByRole('button', { name: /^BundleNodeId\s/ });
    await expect(identity).toHaveCount(1);
    await identity.click();
    const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
    await expect(panel.getByRole('heading', { name: 'BundleNodeId', exact: true })).toBeVisible();
    await expect(panel.getByLabel('Document metadata')).toContainText('Sourcing');
    await expect(panel).toContainText('Current checkout code');
    await expect(panel.getByRole('link', { name: /Select related scenarios/ })).toHaveCount(0);
    await expect(panel.getByRole('region', { name: 'Declaration', exact: true })).toContainText('bundleNodeIdBrand');
    await panel.getByRole('region', { name: 'Higher-level explanations', exact: true }).getByRole('link', { name: 'Bundle Node ID', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Bundle Node ID', exact: true })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Implemented by', exact: true })).toContainText('declare-identity');
    await expect(page).toHaveURL(originalUrl);
    await page.screenshot({ path: testInfo.outputPath('boundary-type-document.png'), fullPage: true });
    await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
    await page.getByLabel('Search area boundaries').fill('source snapshot');
    await lanes.getByLabel('Shared data and artifacts', { exact: true }).getByRole('button', { name: /^Source Snapshot\s/ }).click();
    await expect(panel.getByRole('heading', { name: 'Source Snapshot', exact: true })).toBeVisible();
    await expect(panel.getByLabel('Document metadata').getByRole('link')).toHaveCount(3);
    await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
    await page.getByLabel('Search area boundaries').fill('reviewQueryHtmlPathForPage');
    await expect(lanes.getByLabel('Public APIs', { exact: true }).getByRole('button', { name: /^reviewQueryHtmlPathForPage\s/ })).toBeVisible();
    await expect(page).toHaveURL(originalUrl);
    await page.screenshot({ path: testInfo.outputPath('boundary-api-lanes.png'), fullPage: true });
  } finally { await page.goto('about:blank'); rmSync(run, { recursive: true, force: true }); }
});
