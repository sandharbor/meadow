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

test('Sourcing moves a nested page while preserving its identity and name-only links', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const config = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.bundleNodeName === 't001 ---- child 2')!;
  expect(original.listType).toBe('whitelist');
  await sourceChanges.apply('move-nested-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  await editor.sourceReview.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md');
  await editor.sourceReview.expectMoveListed(original.bundleNodeId);
  await editor.sourceReview.orphans.expectNotListed(original.bundleNodeName);
  await addKeyFrame(sourceMove);
  await snapshot('review identifies the move through the shared source change');
  await editor.sourceReview.accept();
  expect(parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId)).toEqual({ ...original, sourceGraphSubdirectory: 'source-changes/moved' });
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('source-changes/moved/t001 ---- child 2.md', true);
  await editor.expectListViewNodeVisible('t001/deeper/t001 ---- child 2.md', false);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the moved file remains reachable with the same identity and tracking');
  await skipMeadowHomeStateCheck();
});
