/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('Sourcing classifies a renamed linked group once and keeps its pages out of orphan cleanup', async ({ page, sourceChanges, testServer, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const configPath = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8')).filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await sourceChanges.apply('rename-linked-group');
  await editor.checkSourceChanges();
  await editor.expectSourceOrphanCount(13);
  await page.getByRole('button', { name: '17 source changes available – Review', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Source review' });
  await expect(review.getByRole('heading', { name: 'Renames and moves (3)', exact: true })).toBeVisible();
  for (const node of original) {
    await expect(review.getByTestId(`source-move-${node.bundleNodeId}`)).toBeVisible();
    await expect(review.getByTestId(`orphan-row-${node.bundleNodeName}`)).toHaveCount(0);
  }
  await expect(review.getByTestId('source-orphans')).toContainText('Orphaned pages (13)');
  await addKeyFrame(sourceMove);
  await snapshot('three linked moves form review items while existing unrelated orphans remain separate');
  await review.getByRole('button', { name: 'Accept source update', exact: true }).click();
  await expect(review).not.toBeVisible();
  await editor.expectSourceOrphanCount(13);
  const updated = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8'));
  for (const node of original) {
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)?.bundleNodeName).toBe(node.bundleNodeName.replace('t001', 't101'));
  }
  await addKeyFrame(sourceSnapshot);
  await snapshot('the group preserves all three identities after accepting the source update');
  await skipMeadowHomeStateCheck();
});
