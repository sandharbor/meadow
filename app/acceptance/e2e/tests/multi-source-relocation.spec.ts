/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source relocation preserves captured pages and accepts the repaired location explicitly', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const configDir = path.join(testServer.configDir, 'bundles/multi-source-page/config');
  const configFile = path.join(configDir, 'bundle_config.yaml');
  const nodesFile = path.join(configDir, 'bundle_node_config.yaml');
  const beforeConfig = fs.readFileSync(configFile, 'utf8');
  const beforeNodes = fs.readFileSync(nodesFile, 'utf8');
  await sourceChanges.apply('relocate-research', 'multi-source');
  await sources.open();
  await sources.expectDisconnected('source000002');
  await addKeyFrame(bundleSource);
  await snapshot('the disconnected source keeps its accepted captured pages');
  await sources.close();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Overview.md', true);
  await sources.open();
  const relocated = path.join(testServer.sourceGraphsDir, 'multi-source/research-relocated');
  await sources.setDirectory('research', relocated);
  await sources.stage();
  expect(fs.readFileSync(configFile, 'utf8')).toBe(beforeConfig);
  expect(fs.readFileSync(nodesFile, 'utf8')).toBe(beforeNodes);
  await addKeyFrame(sourceSnapshot);
  await snapshot('location repair is staged while accepted configuration remains intact');
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/curation/bundle-config') && response.ok()),
    page.waitForResponse(response => response.url().includes('/obsidian-info') && response.ok()),
    editor.sourceReview.accept(),
  ]);
  expect(YAML.parse(fs.readFileSync(configFile, 'utf8')).sources.find((source: { id: string }) => source.id === 'source000002').directory).toBe(relocated);
  expect(fs.readFileSync(nodesFile, 'utf8')).toBe(beforeNodes);
  // A reload cancels browser fetches before React can run effect cleanup.
  // Let the accepted graph's dependent configuration reads finish first.
  await page.waitForLoadState('networkidle');
  await page.reload();
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  await editor.switchToListView();
  await editor.expectListViewSourceDirectory('_mw_sources/source000002/Overview.md', 'research/');
  await skipMeadowHomeStateCheck();
});
