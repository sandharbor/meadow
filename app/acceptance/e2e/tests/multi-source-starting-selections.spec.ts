/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, startingSelection, sourceSnapshot } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source starting selections preserve the page start when adding a folder and require explicit repair', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
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
  const beforeConfig = YAML.parse(fs.readFileSync(configFile, 'utf8'));
  const originalOverview = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8')).find(node => node.sourceId === 'source000001' && node.bundleNodeName === 'Overview')!;
  const originalStart = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8')).find(node => node.bundleNodeId === beforeConfig.entryBundleNodeId)!;
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  await sources.open();
  await sources.editStartingSelections();
  await sources.addStartingSelection();
  await sources.setStartingSelection(2, 'research', 'folder', 'Same');
  await addKeyFrame(startingSelection);
  await snapshot('the original file stays first when a source folder is added');
  await sources.stage();
  await editor.sourceReview.accept();
  const afterConfig = YAML.parse(fs.readFileSync(configFile, 'utf8'));
  const afterNodes = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8'));
  const collection = afterNodes.find(node => node.bundleNodeId === afterConfig.entryBundleNodeId)!;
  expect(collection.bundleNodeKind).toBe('collection');
  expect(collection.sourceId).toBeUndefined();
  expect(collection.bundleNodeKind === 'collection' && collection.memberBundleNodeIds[0]).toBe(originalStart.bundleNodeId);
  expect(afterNodes.find(node => node.bundleNodeId === originalStart.bundleNodeId)).toEqual(originalStart);
  expect(afterConfig.defaultOutlinksDepth).toBe(beforeConfig.defaultOutlinksDepth);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  const acceptedConfig = fs.readFileSync(configFile, 'utf8');
  await sourceChanges.apply('remove-required-start', 'multi-source');
  await sources.open();
  await sources.editStartingSelections();
  await expect(page.getByRole('textbox', { name: 'Path for starting selection 1', exact: true })).toHaveValue('Start.md');
  expect(fs.readFileSync(configFile, 'utf8')).toBe(acceptedConfig);
  await sources.setStartingSelection(1, 'notes', 'file', 'Overview.md');
  await addKeyFrame(bundleSource, startingSelection);
  await snapshot('the missing start remains selected until the user chooses its replacement');
  await sources.stage();
  await editor.sourceReview.accept();
  const repairedNodes = parseBundleNodeConfig(fs.readFileSync(nodesFile, 'utf8'));
  const repaired = repairedNodes.find(node => node.bundleNodeId === collection.bundleNodeId)!;
  expect(repaired.bundleNodeKind === 'collection' && repaired.memberBundleNodeIds).toEqual([
    originalOverview.bundleNodeId,
    ...(collection.bundleNodeKind === 'collection' ? collection.memberBundleNodeIds.slice(1) : []),
  ]);
  expect(repairedNodes.some(node => node.bundleNodeId === originalStart.bundleNodeId)).toBe(false);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the repaired collection retains its identity and surviving folder selection');
  await skipMeadowHomeStateCheck();
});
