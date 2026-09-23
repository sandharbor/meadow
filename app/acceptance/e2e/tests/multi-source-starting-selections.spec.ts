/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, startingSelection, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

/*
 * Add a folder to a bundle that already starts from a page. Preserve the page selection
 * and require explicit repair when a starting selection becomes invalid.
 */
test('Multi-source starting selections preserve the page start when adding a folder and require explicit repair', async ({ page, testServer, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeConfig = bundleConfig.read();
  const originalOverview = bundleConfig.requireNode({ sourceId: 'source000001', bundleNodeName: 'Overview' });
  const originalStart = bundleConfig.requireNode({ bundleNodeId: beforeConfig.entryBundleNodeId });
  await snapshot('the original page start and its source identities are established');

  // --- Test start ---
  // Add a folder start.
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  await sources.open();
  await sources.editStartingSelections();
  await sources.addStartingSelection();
  await sources.setStartingSelection(2, 'research', 'folder', 'Same');
  await addKeyFrame(startingSelection);
  await snapshot('the original file stays first when a source folder is added');

  // Accept the starting selections.
  await sources.stage();
  await editor.sourceReview.accept();
  const afterConfig = bundleConfig.read();
  const afterNodes = bundleConfig.readNodes();
  const collection = afterNodes.find(node => node.bundleNodeId === afterConfig.entryBundleNodeId)!;
  expect(collection.bundleNodeKind).toBe('collection');
  expect(collection.sourceId).toBeUndefined();
  expect(collection.bundleNodeKind === 'collection' && collection.memberBundleNodeIds[0]).toBe(originalStart.bundleNodeId);
  expect(afterNodes.find(node => node.bundleNodeId === originalStart.bundleNodeId)).toEqual(originalStart);
  expect(afterConfig.defaultOutlinksDepth).toBe(beforeConfig.defaultOutlinksDepth);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  await editor.expectListViewNodeVisible('_mw_sources/source000002/Same/Inside.md', true);
  const acceptedConfig = bundleConfig.readText();
  await snapshot('the accepted collection retains the original page and adds the folder start');

  // Remove the required page start.
  await sourceChanges.apply('remove-required-start', 'multi-source');
  await sources.open();
  await sources.editStartingSelections();
  await expect(page.getByRole('textbox', { name: 'Path for starting selection 1', exact: true })).toHaveValue('Start.md');
  expect(bundleConfig.readText()).toBe(acceptedConfig);
  await snapshot('the missing start remains selected until the user chooses its replacement');

  // Choose a replacement start.
  await sources.setStartingSelection(1, 'notes', 'file', 'Overview.md');
  await addKeyFrame(bundleSource, startingSelection);
  await snapshot('the replacement start is selected and ready to accept');

  // Accept the starting selections.
  await sources.stage();
  await editor.sourceReview.accept();
  const repairedNodes = bundleConfig.readNodes();
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
