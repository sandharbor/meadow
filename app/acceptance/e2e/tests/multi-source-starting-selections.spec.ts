/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, bundleSource, startingSelection, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source starting selections preserve the page start when adding a folder and require explicit repair`);

const description = linkedScenarioDescription(conceptText`Add a folder to a bundle that already starts from a page. Preserve the page selection
and require explicit repair when a starting selection becomes invalid.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'aa046ed6-74f2-4249-af5d-5479b96797f3' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeConfig = bundleConfig.read();
  const originalOverview = bundleConfig.requireNode({ sourceId: 'source000001', bundleNodeName: 'Overview' });
  const originalStart = bundleConfig.requireNode({ bundleNodeId: beforeConfig.entryBundleNodeId });
  await sourceCommand(() => checkpoint('the original page start and its source identities are established'));

  // --- Test start ---
  // Add a folder start.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', true));
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.editStartingSelections());
  await sourceCommand(() => sources.addStartingSelection());
  await sourceCommand(() => sources.setStartingSelection(2, 'research', 'folder', 'Same'));
  await sourceCommand(() => addKeyFrame(startingSelection));
  await sourceCommand(() => checkpoint('the original file stays first when a source folder is added'));

  // Save the starting selections; these files are already included.
  await sourceCommand(() => sources.saveWithoutMaterialChanges());
  const afterConfig = bundleConfig.read();
  const afterNodes = bundleConfig.readNodes();
  const collection = afterNodes.find(node => node.bundleNodeId === afterConfig.entryBundleNodeId)!;
  expect(collection.bundleNodeKind).toBe('collection');
  expect(collection.sourceId).toBeUndefined();
  expect(collection.bundleNodeKind === 'collection' && collection.memberBundleNodeIds[0]).toBe(originalStart.bundleNodeId);
  expect(afterNodes.find(node => node.bundleNodeId === originalStart.bundleNodeId)).toEqual(originalStart);
  expect(afterConfig.defaultOutlinksDepth).toBe(beforeConfig.defaultOutlinksDepth);
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', true));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000002/Same/Inside.md', true));
  const acceptedConfig = bundleConfig.readText();
  await sourceCommand(() => checkpoint('the accepted collection retains the original page and adds the folder start'));

  // Remove the required page start.
  await sourceCommand(() => sourceChanges.apply('remove-required-start', 'multi-source'));
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.editStartingSelections());
  await sourceCommand(() => expect(page.getByRole('textbox', { name: 'Path for starting selection 1', exact: true })).toHaveValue('Start.md'));
  expect(bundleConfig.readText()).toBe(acceptedConfig);
  await sourceCommand(() => checkpoint('the missing start remains selected until the user chooses its replacement'));

  // Choose a replacement start.
  await sourceCommand(() => sources.setStartingSelection(1, 'notes', 'file', 'Overview.md'));
  await sourceCommand(() => addKeyFrame(bundleSource, startingSelection));
  await sourceCommand(() => checkpoint('the replacement start is selected and ready to accept'));

  // Accept the starting selections.
  await sourceCommand(() => sources.stage());
  await sourceCommand(() => editor.sourceReview.accept());
  const repairedNodes = bundleConfig.readNodes();
  const repaired = repairedNodes.find(node => node.bundleNodeId === collection.bundleNodeId)!;
  expect(repaired.bundleNodeKind === 'collection' && repaired.memberBundleNodeIds).toEqual([
    originalOverview.bundleNodeId,
    ...(collection.bundleNodeKind === 'collection' ? collection.memberBundleNodeIds.slice(1) : []),
  ]);
  expect(repairedNodes.some(node => node.bundleNodeId === originalStart.bundleNodeId)).toBe(false);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the repaired collection retains its identity and surviving folder selection'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
