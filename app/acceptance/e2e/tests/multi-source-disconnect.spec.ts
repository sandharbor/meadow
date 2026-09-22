/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source disconnection preserves captured pages until the source is explicitly removed', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const configDir = path.join(testServer.configDir, 'bundles/multi-source-page/config');
  const nodesFile = path.join(configDir, 'bundle_node_config.yaml');
  const beforeNodes = fs.readFileSync(nodesFile, 'utf8');
  await sourceChanges.apply('disconnect-reference', 'multi-source');
  await sources.open();
  await sources.expectDisconnected('source000003');
  await addKeyFrame(bundleSource);
  await snapshot('a disconnected source is identified without discarding its captured material');
  await sources.close();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  expect(fs.readFileSync(nodesFile, 'utf8')).toBe(beforeNodes);
  await sources.open();
  await sources.remove('source000003');
  await sources.stage();
  await editor.sourceReview.orphans.expectOrphanListed('Study');
  await editor.sourceReview.orphans.expectOrphanListed('Appendix');
  await addKeyFrame(sourceSnapshot);
  await snapshot('deliberate removal offers orphan cleanup for the disconnected source');
  await editor.sourceReview.accept();
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'bundle_config.yaml'), 'utf8'));
  expect(config.sources.map((source: { id: string }) => source.id)).toEqual(['source000001', 'source000002']);
  expect(parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8')).some(node => node.sourceId === 'source000003')).toBe(false);
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', false);
  await skipMeadowHomeStateCheck();
});
