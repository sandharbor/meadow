/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('source-change help uses captured definitions, supports older runs, and returns keyboard focus', async ({ page, request }) => {
  const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
  mkdirSync(root, { recursive: true });
  const run = mkdtempSync(path.join(root, 'rv-source-change-help-'));
  const source = [
    'test("source change help", async ({ sourceChanges }) => {',
    '  // sourceChanges.apply("not-a-call");',
    '  await sourceChanges.apply("add-linked-page");',
    '  await sourceChanges.apply("add-linked-page");',
    '});',
  ].join('\n');
  const definition = { id: 'add-linked-page', label: 'Captured source change', action: 'Add the captured `notes.md` page.',
    check: 'The captured page is available.', sourceGraph: 'meadow-test-bundles-data',
    categories: ['add'], e2e: 'sourcing-track-new-pages.spec.ts', operations: [{ write: { path: 'notes.md', contentFile: 'added.md' } }],
  };
  for (const slug of ['captured', 'legacy', 'unavailable']) {
    const dir = path.join(run, slug);
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ testName: slug, logs: [], testSource: source,
      ...(slug === 'legacy' ? {} : { testSourceChanges: slug === 'captured' ? [definition] : [] }),
    }));
  }
  try {
    await page.goto(`/${path.basename(run)}/captured`);
    const help = page.getByRole('button', { name: 'About source change add-linked-page', exact: true });
    await expect(help).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'About source change not-a-call', exact: true })).toHaveCount(0);
    await expect(help.first()).toHaveAttribute('title', /Add the captured `notes.md` page/);
    await help.first().click();
    const dialog = page.getByRole('dialog', { name: 'Captured source change', exact: true });
    await expect(dialog).toContainText('Captured with this run');
    await expect(dialog).toContainText('Add the captured notes.md page.');
    await expect(dialog).toContainText('The captured page is available.');
    await expect(dialog).toContainText('Files & operations');
    await expect(dialog).toContainText('added.md');
    await expect(dialog.getByRole('button', { name: 'Close source change' })).toBeFocused();
    // Native dialogs may tab through browser chrome, then return to their controls.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Close source change' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(help.first()).toBeFocused();
    await help.last().click();
    await dialog.getByRole('button', { name: 'Close source change' }).click();
    await expect(help.last()).toBeFocused();

    await page.goto(`/${path.basename(run)}/legacy`);
    await help.first().click();
    const legacy = page.getByRole('dialog', { name: 'Add a linked Markdown page', exact: true });
    await expect(legacy).toContainText('Current checkout · not captured with this run');
    await expect(legacy).toContainText('Add a Markdown page and link to it from the main page.');
    await page.keyboard.press('Escape');

    const response = await request.get(`/api/${path.basename(run)}/unavailable/test-source`);
    const data = await response.json() as { sourceChanges: { definition: unknown; origin: string }[] };
    expect(data.sourceChanges.every(change => change.definition === null && change.origin === 'run')).toBe(true);
    await page.goto(`/${path.basename(run)}/unavailable`);
    await help.first().click();
    await expect(page.getByRole('dialog')).toContainText('definition is unavailable in the run artifacts');
  } finally {
    await page.goto('about:blank');
    rmSync(run, { recursive: true, force: true });
  }
});
