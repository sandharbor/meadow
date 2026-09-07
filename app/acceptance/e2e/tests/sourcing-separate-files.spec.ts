/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, SourceOrphansReview } from '../src/run/pages/index.js';
import { orphan } from '../../../concepts/index.js';

const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing can keep a renamed file separate and show the orphan provenance', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await new BundleEditorPage(page, expect).waitForSourceCheck();
  await sourceChanges.apply('rename-page-with-links');
  await new BundleEditorPage(page, expect).checkSourceChanges();
  await page.getByRole('button', { name: /source changes? available.*Review/i }).click();
  const review = page.getByRole('dialog', { name: 'Source review' });
  await review.getByText('Details', { exact: true }).click();
  await review.getByRole('radio', { name: /Different pages/ }).check();
  await expect(review.getByText('Separate pages', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Accept source update' }).click();
  await expect(review).not.toBeVisible();
  await editor.expectSourceOrphanCount(14);
  await editor.reviewSourceOrphans();
  await new SourceOrphansReview(page, expect).waitForOpen();
  const row = page.getByTestId(`orphan-row-${originalTitle}`);
  await row.getByText('Why is this orphaned?', { exact: true }).click();
  await expect(row).toContainText('Previously reached through:');
  await expect(row).toContainText('t003 - link to section.md');
  await addKeyFrame(orphan);
  await snapshot('keeping files separate leaves an explained orphan');
  await skipMeadowHomeStateCheck();
});
