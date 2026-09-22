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

test('Sourcing moves a nested group while unchanged name-only links retain all three identities', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const config = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await sourceChanges.apply('move-nested-group');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(3);
  for (const node of original) {
    await editor.sourceReview.expectMoveListed(node.bundleNodeId);
    await editor.sourceReview.orphans.expectNotListed(node.bundleNodeName);
  }
  await addKeyFrame(sourceMove);
  await snapshot('all three reachable pages are proposed as moves');
  await editor.sourceReview.accept();
  const updated = parseBundleNodeConfig(fs.readFileSync(config, 'utf8'));
  await editor.switchToListView();
  for (const node of original) {
    const directory = node.bundleNodeName === 't001 ---- child 2' ? 'source-changes/nested/deeper' : 'source-changes/nested';
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)).toEqual({ ...node, sourceGraphSubdirectory: directory });
    await editor.expectListViewNodeVisible(`${directory}/${node.bundleNodeName}.md`, true);
  }
  await addKeyFrame(sourceSnapshot);
  await snapshot('unchanged links reach the relocated group after acceptance');
  await skipMeadowHomeStateCheck();
});
