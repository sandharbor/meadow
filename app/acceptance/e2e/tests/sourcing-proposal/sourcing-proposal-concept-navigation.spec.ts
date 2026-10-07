/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { startReportViewer } from '../../src/run/reportViewer.js';
import { BundleListPage } from '../../src/run/pages/index.js';
import { sourcingReviewRedesign, conceptImplementationNavigation, conceptRoleValidation, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ executionSurfaces: ['browser'] });

const name = linkedScenarioName(conceptText`Concept pages derive implemented-by navigation from exact inline participation identities`);

const description = linkedScenarioDescription(conceptText`Open a canonical concept from a real report and follow its derived role/symbol/location link.
The highlighted source line must name the production function, and two concepts sharing a
role name must retain separate identities. Concepts without participants show no invented links.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '646aabe1-ce31-4123-a574-b9cd8ca878da' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, checkpoint, addKeyFrame, assertMeadowHomeState }, testInfo) => {
  // --- Setup ---
  await sourceCommand(() => new BundleListPage(page, expect).goto());
  const viewer = await sourceCommand(() => startReportViewer(expect));
  try {
    await sourceCommand(() => page.goto(`${viewer.url}/concepts/${sourceSnapshot.id}`));
    await sourceCommand(() => expect(page.getByRole('heading', { name: 'Source Snapshot', exact: true })).toBeVisible());
    const implementations = page.getByRole('region', { name: 'Implemented by', exact: true });
    await sourceCommand(() => expect(implementations.getByRole('link', { name: /capture · captureSourceSnapshot/ })).toBeVisible());
    await sourceCommand(() => expect(implementations.getByRole('link', { name: /accept · acceptSourceSnapshot/ })).toBeVisible());
    await sourceCommand(() => checkpoint('the canonical concept lists exact inline role symbol and location identities'));

    // --- Test start ---
    // Navigate to the actual implementation rather than the metadata tuple that describes it.
    await sourceCommand(() => implementations.getByRole('link', { name: /capture · captureSourceSnapshot/ }).click());
    const source = page.getByRole('region', { name: 'Implementation source', exact: true });
    await sourceCommand(() => expect(source).toContainText('export async function captureSourceSnapshot'));
    const address = new URL(page.url());
    const file = address.searchParams.get('file')!;
    const line = Number(address.searchParams.get('line'));
    expect(file).toBe('runtime/service/src/shared/source-snapshot/sourceSnapshots.ts');
    const actual = fs.readFileSync(path.resolve(import.meta.dirname, '../../../..', file), 'utf8').split('\n')[line - 1];
    expect(actual).toContain('export async function captureSourceSnapshot');
    await sourceCommand(() => expect(page.getByText(actual.trim(), { exact: false }).last()).toBeVisible());
    await sourceCommand(() => addKeyFrame(conceptImplementationNavigation));
    await sourceCommand(() => checkpoint('the selected participation opens the source at its real implementation declaration'));

    // The page survives reload and related-concept navigation preserves exact identities.
    await sourceCommand(() => page.reload());
    await sourceCommand(() => expect(source).toContainText('export async function captureSourceSnapshot'));
    await sourceCommand(() => page.getByRole('link', { name: 'Source Changes During Review', exact: true }).click());
    await sourceCommand(() => expect(page.getByRole('heading', { name: 'Source Changes During Review', exact: true })).toBeVisible());
    await sourceCommand(() => expect(implementations).toHaveCount(0));
    await sourceCommand(() => expect(page.getByText('No implementation declared.', { exact: true })).toBeVisible());
    await sourceCommand(() => addKeyFrame(conceptRoleValidation));
    await sourceCommand(() => checkpoint('a concept without declared participants makes no implementation claims'));
  } finally {
    await sourceCommand(() => page.goto('about:blank'));
    await sourceCommand(() => viewer.stop());
    await sourceCommand(() => testInfo.attach('report-viewer.log', { body: viewer.logs(), contentType: 'text/plain' }));
  }
  await sourceCommand(() => assertMeadowHomeState());
});
