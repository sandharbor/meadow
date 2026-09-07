/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceChange, orphan } from '../../../concepts/index.js';


test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing accepts a shared link deletion only when requested and explains its broken route', async ({ page, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await new BundleEditorPage(page, expect).waitForSourceCheck();
  await sourceChanges.apply('remove-incoming-link');
  await new BundleEditorPage(page, expect).checkSourceChanges();
  await page.getByRole('button', { name: /source changes? available.*Review/i }).click();
  const review = page.getByRole('dialog', { name: 'Source review' });
  await expect(review).toContainText('Modified');
  await expect(review.getByText('Possible move or rename', { exact: true })).not.toBeVisible();
  await review.getByRole('button', { name: 'Inspect t001 - deeply nested.md', exact: true }).click();
  const diff = review.getByRole('region', { name: 'Source content comparison' });
  await expect(diff.getByRole('table', { name: 'Accepted source to Candidate source' })).toBeVisible();
  await expect(diff.getByRole('row', { name: /\[\[t001 ---- child 2\]\]/ })).toHaveAttribute('data-change', 'removed');
  await expect(diff.getByRole('row', { name: /child 2 \(link removed\)/ })).toHaveAttribute('data-change', 'added');
  await addKeyFrame(sourceChange);
  await snapshot('link deletion is reviewed as a source edit');
  await review.getByRole('button', { name: 'Accept source update' }).click();
  await expect(review).not.toBeVisible();
  await editor.reviewSourceOrphans();
  const row = page.getByTestId('orphan-row-t001 ---- child 2');
  await row.getByText('Why is this orphaned?', { exact: true }).click();
  await expect(row).toContainText('no longer connects');
  await addKeyFrame(orphan);
  await snapshot('orphan details identify the removed connection');
  await skipMeadowHomeStateCheck();
});
