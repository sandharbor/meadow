/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('Sourcing does not assign identity to a renamed page whose old link is unchanged', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const config = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big/config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.bundleNodeName === 't003 ---- page with section to link to')!;
  expect(original).toBeDefined();
  await sourceChanges.apply('rename-page-without-links');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectNoRenames();
  await editor.sourceReview.orphans.expectOrphanListed(original.bundleNodeName);
  await editor.sourceReview.orphans.showExplanation(original.bundleNodeName);
  await editor.sourceReview.orphans.expectExplanation(original.bundleNodeName, 'but that file does not exist in the filesystem.');
  expect(parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId)).toEqual(original);
  await addKeyFrame(orphan);
  await snapshot('the missing page keeps its accepted configuration until review is accepted');
  await editor.sourceReview.accept();
  expect(parseBundleNodeConfig(fs.readFileSync(config, 'utf8')).some(node => node.bundleNodeId === original.bundleNodeId)).toBe(false);
  await editor.expectSourceOrphanCount(0);
  await addKeyFrame(sourceSnapshot);
  await snapshot('acceptance removes the orphaned configuration');
  await skipMeadowHomeStateCheck();
});
