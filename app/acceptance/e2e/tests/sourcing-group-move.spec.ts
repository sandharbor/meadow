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
  await expect(page.getByRole('button', { name: '17 source changes available – Review', exact: true })).toBeVisible();
  const review = editor.sourceReview;
  await review.open();
  await review.expectMoveCount(3);
  for (const node of original) {
    await review.expectMoveListed(node.bundleNodeId);
    await review.orphans.expectNotListed(node.bundleNodeName);
  }
  await review.orphans.expectSummaryCount(13);
  await addKeyFrame(sourceMove);
  await snapshot('three linked moves form review items while existing unrelated orphans remain separate');
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  const updated = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8'));
  for (const node of original) {
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)?.bundleNodeName).toBe(node.bundleNodeName.replace('t001', 't101'));
  }
  await addKeyFrame(sourceSnapshot);
  await snapshot('the group preserves all three identities after accepting the source update');
  await skipMeadowHomeStateCheck();
});
