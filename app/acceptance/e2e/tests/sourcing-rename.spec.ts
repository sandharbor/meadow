/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceSnapshot, sourceMove } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing reviews a shared rename without disrupting curation and preserves page identity', async ({ page, sourceChanges, testServer, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  const configPath = path.join(testServer.configDir, 'bundles', slug, 'config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8')).find(node => node.bundleNodeName === originalTitle)!;
  await new BundleEditorPage(page, expect).waitForSourceCheck();
  await editor.expectSourceOrphanCount(13);
  await sourceChanges.apply('rename-page-with-links');
  await new BundleEditorPage(page, expect).checkSourceChanges();
  await expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Source review' })).not.toBeVisible();
  await editor.expectSourceOrphanCount(13);
  await addKeyFrame(sourceSnapshot);
  await snapshot('candidate waits while accepted curation remains stable');

  await page.getByRole('button', { name: /source changes? available.*Review/i }).click();
  const review = page.getByRole('dialog', { name: 'Source review' });
  await expect(review.getByRole('button', { name: 'Accept source update' })).toBeEnabled();
  const close = review.getByRole('button', { name: 'Close source review' });
  await expect(close).toHaveText('×');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(review.getByRole('button', { name: 'Accept source update', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await expect(review.getByRole('group', { name: `Renamed: ${originalTitle}.md → ${renamedTitle}.md`, exact: true })).toBeVisible();
  await expect(review.getByRole('radio')).not.toBeVisible();
  await expect(review.getByText('Decide before accepting', { exact: false })).not.toBeVisible();
  await expect(review.getByText('Identical file contents', { exact: false })).not.toBeVisible();
  await expect(review.getByRole('button', { name: 'Compare content' })).not.toBeVisible();
  await addKeyFrame(sourceMove);
  await snapshot('proposed rename is ready to accept with choices and evidence collapsed');
  await review.getByText('Details', { exact: true }).click();
  await expect(review.getByRole('radio', { name: /Same page/ })).toBeChecked();
  await review.getByRole('button', { name: 'Compare content' }).click();
  await expect(review.getByRole('region', { name: 'Source content comparison' })).toContainText('No content changes');
  await addKeyFrame(sourceMove);
  await snapshot('rename evidence includes old and new location and source contents');
  await page.keyboard.press('Escape');
  await expect(review).not.toBeVisible();
  await expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeFocused();
  await page.getByRole('button', { name: /source changes? available.*Review/i }).click();
  await expect(review.getByRole('radio')).not.toBeVisible();
  await review.getByRole('button', { name: 'Accept source update' }).click();
  await expect(review).not.toBeVisible();
  await expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toHaveText('13 source changes available – Review');
  await expect.poll(() => parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId)?.bundleNodeName).toBe(renamedTitle);
  await editor.expectSourceOrphanCount(13);
  await editor.switchToListView();
  await expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible();
  await addKeyFrame(sourceSnapshot);
  await snapshot('accepted rename keeps the existing tracked page identity');
  await skipMeadowHomeStateCheck();
});
