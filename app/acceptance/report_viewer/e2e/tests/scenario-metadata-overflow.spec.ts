/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { URL } from 'node:url';

for (const width of [1280, 390]) {
  test(`scenario metadata disclosure follows content width at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const catalog = await (await request.get('/api/concepts?all=true')).json() as { id: string; kind?: string; subAreas?: unknown[] }[];
    const concepts = catalog.filter(doc => doc.kind !== 'app-area' && !doc.subAreas?.length).slice(0, 24).map(doc => doc.id);
    const compact = { testName: 'Compact metadata', bundleMode: 'single-file', logs: [], keyFrames: [], conceptIds: [], appAreaDocIds: [], subAreaDocIds: [] };
    const busy = { ...compact, testName: 'Many concepts', conceptIds: concepts, appAreaDocIds: ['bundle/curation'] };
    await page.route('**/api/runs/metadata-overflow', route => route.fulfill({ json: { runId: 'metadata-overflow', scenarios: [] } }));
    await page.route('**/api/runs/metadata-overflow/health', route => route.fulfill({ json: {} }));
    await page.route('**/api/metadata-overflow/*/*', route => {
      const parts = new URL(route.request().url()).pathname.split('/');
      const endpoint = parts.at(-1), scenario = parts.at(-2);
      return route.fulfill({ json: endpoint === 'manifest' ? scenario === 'compact' ? compact : busy
        : endpoint === 'test-source' ? { source: '' } : endpoint === 'backend-telemetry' ? {} : [] });
    });
    await page.goto('/metadata-overflow/compact');
    const metadata = page.getByRole('region', { name: 'Scenario metadata', exact: true });
    const expand = metadata.getByRole('button', { name: 'Expand scenario metadata', exact: true });
    await expect(metadata.getByRole('group', { name: 'Starts with', exact: true })).toBeVisible();
    await expect(expand).toHaveCount(0);

    await page.goto('/metadata-overflow/busy');
    await expect(expand).toBeVisible();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.click();
    await expect(metadata.getByRole('button', { name: 'Collapse scenario metadata', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(metadata.getByRole('group', { name: 'Concepts', exact: true }).getByRole('button')).toHaveCount(concepts.length);
    await expect.poll(() => metadata.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await metadata.screenshot({ path: testInfo.outputPath('expanded-overflow-metadata.png') });
    await metadata.getByRole('button', { name: 'Collapse scenario metadata', exact: true }).click();
    await expect(expand).toBeVisible();

    await page.setViewportSize({ width: 5000, height: 900 });
    await expect(expand).toHaveCount(0);
    await page.setViewportSize({ width, height: 900 });
    await expect(expand).toBeVisible();
  });
}
