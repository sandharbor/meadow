/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioSections, sourceSensitivity } from '../../../../concepts/index.js';

for (const width of [1280, 390]) {
  test(`linked sections appear inline and optionally in Details at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const root = path.join(os.homedir(), 'meadow-e2e-artifacts/current');
    mkdirSync(root, { recursive: true });
    const run = mkdtempSync(path.join(root, 'rv-sections-'));
    const runId = path.basename(run);
    const dir = path.join(run, 'sections');
    mkdirSync(dir);
    const nameText = conceptText`Automatic tracking respects sensitivity`;
    const descriptionText = conceptText`Accept safe additions and preview the result.`;
    const setupText = 'Establish the accepted sensitivity policy.';
    const reviewText = conceptText`Review automatic tracking and skip the ${conceptLink(sourceSensitivity.id, 'source-sensitive')} addition.`;
    const declared = scenarioSections({
      setup: { type: 'setup', text: conceptText`Establish the accepted sensitivity policy.` },
      review: { type: 'test', text: reviewText },
      accept: { type: 'test', text: conceptText`Accept the choices and verify the saved configuration.` },
    });
    const sections = JSON.parse(declared.annotation.description);
    const source = [
      'test.use({ fixtureHome: Fixture.SourcingReview });',
      'const name = linkedScenarioName(conceptText`Automatic tracking respects sensitivity`);',
      'const description = linkedScenarioDescription(conceptText`Accept safe additions and preview the result.`);',
      'const sections = scenarioSections({',
      '  setup: { type: "setup", text: conceptText`Establish the accepted sensitivity policy.` },',
      '  review: { type: "test", text: conceptText`Review automatic tracking.` },',
      '  accept: { type: "test", text: conceptText`Accept the choices.` },',
      '});',
      'test(name.name, { annotation: [name.annotation, description.annotation, sections.annotation] }, async () => {',
      '  await test.step(sections.steps.setup, async () => {',
      '    await sourceCommand(() => checkpoint("ready"));',
      '  });',
      '  await test.step(sections.steps.review, async () => {',
      '    await sourceCommand(() => checkpoint("reviewed"));',
      '  });',
      '  await test.step(sections.steps.accept, async () => {',
      '    await sourceCommand(() => checkpoint("accepted"));',
      '  });',
      '});',
    ].join('\n');
    const info = { testName: linkedScenarioName(nameText).name, nameText,
      description: linkedScenarioDescription(descriptionText).description, descriptionText, sections,
      executionSurface: 'cli', executionSurfaces: ['cli'], duration: 1,
      conceptIds: [sourceSensitivity.id], appAreaDocIds: [], subAreaDocIds: [], bundleDocIds: [], keyFrames: [], status: 'passed' };
    writeFileSync(path.join(dir, 'status.txt'), 'passed');
    writeFileSync(path.join(dir, 'report-meta.json'), JSON.stringify({ version: 1, scenarioInfo: info }));
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...info, testSource: source,
      logs: [], homeCommits: [], homeCommitMeta: [], minioCommitMeta: [], ticks: [], uncommittedEntries: [], testSourceFixtures: [] }));
    try {
      const response = await request.get(`/api/runs/${runId}`);
      expect((await response.json()).scenarios[0].sections).toEqual(sections);
      await page.goto(`/${runId}?view=details`);
      const row = page.getByRole('article', { name: info.testName, exact: true });
      const list = row.getByRole('list', { name: 'Scenario sections', exact: true });
      await expect(list).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Show sections', exact: true }).check();
      await expect(list.getByRole('listitem')).toHaveCount(2);
      await expect(list).not.toContainText(setupText);
      await list.getByRole('link', { name: 'source-sensitive', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Floating concept details', exact: true });
      await expect(panel.getByRole('heading', { name: sourceSensitivity.name, exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath('sections-details.png'), fullPage: true });
      await page.getByRole('checkbox', { name: 'Show sections', exact: true }).uncheck();
      await expect(list).toHaveCount(0);

      await page.goto(`/${runId}/sections`);
      await page.getByRole('button', { name: 'Test Code', exact: true }).click();
      const setup = page.getByRole('region', { name: 'Scenario section: setup', exact: true });
      const review = page.getByRole('region', { name: 'Scenario section: review', exact: true });
      await expect(setup).toContainText(setupText);
      await expect(setup).toContainText('Setup');
      await expect(review).toContainText('Section 1');
      await expect(page.getByRole('region', { name: 'Scenario section: accept', exact: true })).toContainText('Section 2');
      await expect(page.locator('[data-source-line="4"]')).toHaveCount(0);
      await expect(page.locator('[data-source-line="12"]')).toHaveCount(0);
      await expect(page.locator('[data-source-line="11"]')).toContainText('checkpoint("ready")');
      await expect(page.locator('[data-source-line="14"]')).toContainText('checkpoint("reviewed")');
      expect((await setup.boundingBox())!.y).toBeLessThan((await page.locator('[data-source-line="11"]').boundingBox())!.y);
      await review.getByRole('link', { name: 'source-sensitive', exact: true }).click();
      await expect(panel.getByRole('heading', { name: sourceSensitivity.name, exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Close concept details', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath('sections-code.png'), fullPage: true });
      await page.getByRole('checkbox', { name: 'show the real code', exact: true }).check();
      await expect(setup).toHaveCount(0);
      await expect(review).toHaveCount(0);
      await expect(page.locator('[data-source-line="4"]')).toContainText('const sections = scenarioSections');
      await expect(page.locator('[data-source-line="10"]')).toContainText('test.step(sections.steps.setup');
      await page.getByRole('checkbox', { name: 'show the real code', exact: true }).uncheck();
      await expect(review).toBeVisible();
      // Legacy captures retain their source rather than losing declarations without prose.
      delete (info as Partial<typeof info>).sections;
      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...info, testSource: source, logs: [], ticks: [], keyFrames: [] }));
      await page.reload();
      await page.getByRole('button', { name: 'Test Code', exact: true }).click();
      await expect(page.locator('[data-source-line="4"]')).toContainText('const sections = scenarioSections');
    } finally {
      await page.goto('about:blank');
      rmSync(run, { recursive: true, force: true });
    }
  });
}
