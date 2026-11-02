/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Real catalogs exercise captured metadata through the server; current metadata must never override them.
async function capturedRun(request: APIRequestContext, legacy = false, nested = false) {
  const catalog = await (await request.get('/api/documents')).json();
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-ui-'));
  const fixture = catalog.documents.find((doc: { documentKind: string }) => doc.documentKind === 'fixture') as { id: string; name: string };
  const contribution = catalog.documents.find((doc: { id: string }) => doc.id === catalog.contributedIds[0]) as { id: string; name: string } | undefined;
  const oldUiIds = ['find-in-bundles', 'tracking-changes-panel', 'graph-search', 'graph-title-labels', 'node-details', 'node-path-details', 'node-link-details', 'folder-filter', 'changes-tab', 'preview-browser'];
  if (!nested) catalog.documents = catalog.documents.map((doc: { id: string; kind?: string }) => doc.kind === 'ui-sub-area' && !oldUiIds.includes(doc.id) ? { ...doc, kind: 'mechanism' } : doc);
  const scenarios = [
    { slug: 'tracking-review', appAreaDocIds: ['bundle/sourcing'], conceptIds: ['tracking-changes-panel', 'source-snapshot', 'source-content-change', ...(contribution ? [contribution.id] : [])], subAreaDocIds: ['source-review-workspace'] },
    { slug: 'other-review', appAreaDocIds: ['bundle/sourcing'], conceptIds: nested ? ['page-changes-filters', 'source-content-change'] : [], subAreaDocIds: ['source-review-workspace'] },
    { slug: 'node-inspection', appAreaDocIds: ['bundle/curation'], conceptIds: ['node-details'], subAreaDocIds: ['node-details'] },
    { slug: 'folder-inspection', appAreaDocIds: ['bundle/curation'], conceptIds: ['folder-filter'], subAreaDocIds: [] },
    { slug: 'preview-inspection', appAreaDocIds: ['bundle/review'], conceptIds: ['preview-browser'], subAreaDocIds: ['preview-browser'] },
  ];
  for (const scenario of scenarios) {
    const directory = path.join(run, scenario.slug); mkdirSync(directory);
    const info = { ...scenario, testName: scenario.slug.replaceAll('-', ' '), duration: 1, executionSurface: 'browser', bundleMode: 'single-file', bundleDocIds: [fixture.id], sourceChangeCategories: scenario.slug === (nested ? 'other-review' : 'tracking-review') ? ['modify'] : [], keyFrames: [], designPressureIds: [] };
    writeFileSync(path.join(directory, 'status.txt'), 'passed');
    writeFileSync(path.join(directory, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
    writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ ...info, logs: [], homeCommits: [], homeCommitMeta: [], minioCommitMeta: [], ticks: [], uncommittedEntries: [] }));
  }
  writeFileSync(path.join(run, 'documents.json'), JSON.stringify({ ...catalog, version: 1, capturedAt: new Date().toISOString(),
    documents: catalog.documents.map((document: { id: string; kind?: string; descriptionText: unknown }) => ({ ...document, description: document.descriptionText,
      ...(!nested && document.id === 'tracking-changes-panel' ? { parentId: 'source-review-workspace' } : {}),
      ...(legacy && document.kind === 'ui-sub-area' ? { kind: 'interface', ...(document.id === 'node-details' ? { subAreas: [{ areaId: 'bundle/curation', order: 3 }] } : {}) } : {}) })),
    scenarios: scenarios.map(scenario => ({ ...scenario, testFile: `${scenario.slug}.spec.ts`, bundleDocIds: [], designPressureIds: [] })),
  }));
  return { directory: run, id: path.basename(run), fixture, contribution };
}

test('UI rows filter separately from workflows; split document controls preserve filters', async ({ page, request }, testInfo) => {
  const run = await capturedRun(request);
  try {
    await page.goto(`/${run.id}?view=list&area=bundle/sourcing&area=bundle/curation`);
    const sourcing = page.getByRole('group', { name: 'Bundle Sourcing UI sub-areas', exact: true });
    const curation = page.getByRole('group', { name: 'Bundle Curation UI sub-areas', exact: true });
    const workflow = page.getByRole('group', { name: 'Bundle Sourcing sub-areas', exact: true });
    await expect(sourcing).toBeVisible(); await expect(curation).toBeVisible();
    await expect(workflow.getByRole('button', { name: 'Tracking Changes Panel', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Bundle Curation sub-areas', exact: true }).getByRole('button', { name: 'Node Details', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Concept filters', exact: true }).getByRole('button', { name: 'Tracking Changes Panel', exact: true })).toHaveCount(0);
    const tracking = sourcing.getByRole('button', { name: 'Tracking Changes Panel', exact: true });
    await tracking.click();
    await expect(page.getByRole('link', { name: /tracking review/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /other review/ })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Floating concept details', exact: true })).toHaveCount(0);
    await curation.getByRole('button', { name: 'Node Details', exact: true }).click();
    await expect(page.getByRole('link', { name: /node inspection/ })).toBeVisible();
    await workflow.getByRole('button', { name: 'Source Review Workspace', exact: true }).click();
    await expect(page.getByRole('link', { name: /node inspection/ })).toHaveCount(0);
    const filteredUrl = page.url();
    await sourcing.getByRole('button', { name: 'Read Tracking Changes Panel', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
    await expect(details.getByRole('heading', { name: 'Tracking Changes Panel', exact: true })).toBeVisible();
    await expect(details).toContainText('Documentation captured with this run.');
    await expect(details.getByRole('heading', { name: 'Mechanics', exact: true })).toBeVisible();
    await expect(page).toHaveURL(filteredUrl);
    await details.getByRole('navigation', { name: 'Related concepts', exact: true }).getByRole('link', { name: 'Source Review Workspace', exact: true }).click();
    await expect(details.getByRole('heading', { name: 'Source Review Workspace', exact: true })).toBeVisible();
    await expect(page).toHaveURL(filteredUrl);
    await details.getByRole('button', { name: 'Close concept details', exact: true }).click();
    await page.reload(); await expect(tracking).toHaveAttribute('aria-pressed', 'true');
    await curation.getByRole('button', { name: 'All', exact: true }).click();
    await expect(tracking).toHaveAttribute('aria-pressed', 'true'); await expect(page).not.toHaveURL(/uisubarea=node-details/);
    await page.screenshot({ path: testInfo.outputPath('ui-sub-areas.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sourcing).toBeVisible();
    const box = (await sourcing.boundingBox())!; expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('ui-sub-areas-mobile.png'), fullPage: true });
  } finally { rmSync(run.directory, { recursive: true, force: true }); }
});

test('old sub-area bookmarks, customized mixes, and area cleanup retain stable UI identities', async ({ page, request }) => {
  const run = await capturedRun(request);
  try {
    await page.goto(`/${run.id}?view=list&area=bundle/curation&subarea=node-details`);
    const ui = page.getByRole('group', { name: 'Bundle Curation UI sub-areas', exact: true });
    await expect(ui.getByRole('button', { name: 'Node Details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /node inspection/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /folder inspection/ })).toHaveCount(0);
    await ui.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).not.toHaveURL(/subarea=/); await expect(page.getByRole('link', { name: /folder inspection/ })).toBeVisible();
    await page.goto(`/${run.id}?view=list&mix=${encodeURIComponent('without(everything, subarea:node-details)')}`);
    await expect(ui.getByRole('button', { name: 'Node Details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /node inspection/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /tracking review/ })).toBeVisible();
    await ui.getByRole('button', { name: 'All', exact: true }).click(); await expect(page).not.toHaveURL(/mix=/);
    await page.goto(`/${run.id}?view=list&area=bundle/review&uisubarea=preview-browser`);
    await expect(page.getByRole('group', { name: 'Bundle Review UI sub-areas', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Bundle Review sub-areas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /preview inspection/ })).toBeVisible();
    await page.getByRole('group', { name: 'Areas', exact: true }).getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).not.toHaveURL(/uisubarea=/);
  } finally { rmSync(run.directory, { recursive: true, force: true }); }
});

test('older catalogs retain original interface and workflow grouping', async ({ page, request }) => {
  const run = await capturedRun(request, true);
  try {
    await page.goto(`/${run.id}?view=list&area=bundle/curation&subarea=node-details`);
    await expect(page.getByRole('group', { name: 'Bundle Curation UI sub-areas', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Bundle Curation sub-areas', exact: true }).getByRole('button', { name: 'Node Details', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /node inspection/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /folder inspection/ })).toHaveCount(0);
    const catalog = await (await request.get(`/api/concepts?run=${run.id}`)).json() as { id: string; kind: string }[];
    expect(catalog.find(doc => doc.id === 'node-details')?.kind).toBe('interface');
  } finally { rmSync(run.directory, { recursive: true, force: true }); }
});


test('every document-backed overview row uses the same independent split control; synthetic values have none', async ({ page, request }, testInfo) => {
  const run = await capturedRun(request);
  try {
    await page.goto(`/${run.id}?view=list&area=bundle/sourcing&area=bundle/curation`);
    const rows = [
      ['Areas', 'Bundle Sourcing'], ['Bundle Sourcing sub-areas', 'Source Review Workspace'],
      ['Bundle Sourcing UI sub-areas', 'Tracking Changes Panel'], ['Bundles', run.fixture.name],
      ['Concept filters', 'Source Snapshot'], ['Source changes', 'Source Review Modification'], ['Interface', 'Web Client'],
      ...(run.contribution ? [['Contributed concept filters', run.contribution.name]] : []),
    ];
    for (const [row, document] of rows) {
      const group = page.getByRole('group', { name: row, exact: true });
      const arrow = group.getByRole('button', { name: `Read ${document}`, exact: true });
      const originalUrl = page.url();
      await expect(arrow).toBeVisible();
      await expect(arrow).toHaveClass(/text-neutral-600/);
      expect((await arrow.boundingBox())!.width).toBeGreaterThanOrEqual(24);
      await arrow.focus(); await page.keyboard.press('Enter');
      const details = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
      await expect(details.getByRole('heading', { name: document, exact: true })).toBeVisible();
      await expect(page).toHaveURL(originalUrl);
      await details.getByRole('button', { name: 'Close concept details', exact: true }).click();
    }
    await expect(page.getByRole('group', { name: 'Starts with', exact: true }).getByRole('button', { name: /^Read / })).toHaveCount(0);
    const sourceChanges = page.getByRole('group', { name: 'Source changes', exact: true });
    await expect(sourceChanges.getByRole('button', { name: 'add', exact: true }).locator('..').getByRole('button', { name: /^Read / })).toHaveCount(0);
    await sourceChanges.getByRole('button', { name: 'modify', exact: true }).click();
    const subtype = page.getByRole('group', { name: 'Modify source change subtypes', exact: true });
    await expect(subtype.getByRole('button', { name: 'Read Source Content Change', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('split-document-filters.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('split-document-filters-mobile.png'), fullPage: true });
  } finally { rmSync(run.directory, { recursive: true, force: true }); }
});

test('sourcing UI branches expand with conditional headings, refine independently, and clear descendants', async ({ page, request }, testInfo) => {
  const run = await capturedRun(request, false, true);
  try {
    await page.goto(`/${run.id}?view=list&area=bundle/sourcing`);
    const root = page.getByRole('group', { name: 'Bundle Sourcing UI sub-areas', exact: true });
    const tray = page.getByRole('group', { name: 'Changes Tray UI sub-areas', exact: true });
    const changes = page.getByRole('group', { name: 'Source changes', exact: true });
    const details = page.getByRole('group', { name: 'Area details', exact: true });
    await expect(root.getByRole('button', { name: /^(Changes Tray|Page Changes Filters)$/ })).toHaveCount(2);
    await expect(root.getByRole('button', { name: 'Tracking Changes Panel', exact: true })).toHaveCount(0);
    await expect(tray).toHaveCount(0); await expect(changes).toHaveCount(0);
    await root.getByRole('button', { name: 'Changes Tray', exact: true }).click();
    await expect(tray).toBeVisible(); await expect(details.getByRole('heading')).toHaveCount(0);
    for (const name of ['Page Identity Panel', 'Page Changes Panel', 'Configuration Removals Panel', 'Setting Changes Panel',
      'Tracking Changes Panel', 'Configuration Conflicts Dialog', 'Tracking Sensitivity Dialog', 'Track Added Pages']) {
      await expect(tray.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await root.getByRole('button', { name: 'Page Changes Filters', exact: true }).click();
    await expect(changes).toBeVisible();
    await expect(details.getByRole('heading')).toHaveText(['Changes Tray', 'Page Changes Filters']);
    await tray.getByRole('button', { name: 'Tracking Changes Panel', exact: true }).click();
    await changes.getByRole('button', { name: 'modify', exact: true }).click();
    const subtypes = page.getByRole('group', { name: 'Modify source change subtypes', exact: true });
    await subtypes.getByRole('button', { name: 'Source change', exact: true }).click();
    await expect(page.getByRole('link', { name: /tracking review/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /other review/ })).toBeVisible();
    await page.reload();
    await expect(tray.getByRole('button', { name: 'Tracking Changes Panel', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await details.screenshot({ path: testInfo.outputPath('sourcing-ui-branches.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await details.boundingBox())!.x + (await details.boundingBox())!.width).toBeLessThanOrEqual(390);
    await details.screenshot({ path: testInfo.outputPath('sourcing-ui-branches-mobile.png') });
    await root.getByRole('button', { name: 'Page Changes Filters', exact: true }).click();
    await expect(changes).toHaveCount(0); await expect(subtypes).toHaveCount(0);
    await expect(page).not.toHaveURL(/sourcechange/);
    await expect(details.getByRole('heading')).toHaveCount(0);
    await tray.getByRole('button', { name: 'All', exact: true }).click();
    await expect(root.getByRole('button', { name: 'Changes Tray', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(tray.getByRole('button', { name: 'Tracking Changes Panel', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await root.getByRole('button', { name: 'All', exact: true }).click();
    await expect(tray).toHaveCount(0);
    await page.goto(`/${run.id}?view=list&area=bundle/sourcing&uisubarea=tracking-changes-panel`);
    await expect(tray).toBeVisible();
    await expect(root.getByRole('button', { name: 'Changes Tray', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /other review/ })).toHaveCount(0);
    await page.goto(`/${run.id}?view=list&mix=${encodeURIComponent('without(any(uisubarea:tracking-changes-panel, all(uisubarea:page-changes-filters, sourcechange:modify)), doc:unrelated)')}`);
    await expect(tray).toBeVisible(); await expect(changes).toBeVisible();
    await root.getByRole('button', { name: 'Page Changes Filters', exact: true }).click();
    await expect(changes).toHaveCount(0); await expect(page).not.toHaveURL(/sourcechange/);
    await expect(page.getByRole('link', { name: /tracking review/ })).toBeVisible();
    // A source-change bookmark from before UI nesting keeps its category-only meaning.
    await page.goto(`/${run.id}?view=list&area=bundle/sourcing&sourcechange=modify`);
    await expect(changes).toBeVisible();
    await expect(page.getByRole('link', { name: /other review/ })).toBeVisible();
  } finally { rmSync(run.directory, { recursive: true, force: true }); }
});
