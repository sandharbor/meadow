/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { scenarioSections, bundleSource, startingSelection, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration, sourceReviewWorkspace, sourceSetupEdit } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source starting selections preserve the page start when adding a folder and require explicit repair`);

const description = linkedScenarioDescription(conceptText`Add a folder to a bundle that already starts from a page. Preserve the page selection
and require explicit repair when a starting selection becomes invalid.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the original page start and its source identities are established.` },
  addFolderStart: { type: 'test', text: conceptText`Add a folder start.` },
  saveStartingSelectionsTheseFilesAreAlready: { type: 'test', text: conceptText`Save the starting selections; these files are already included.` },
  removeRequiredPageStart: { type: 'test', text: conceptText`Remove the required page start.` },
  chooseReplacementStart: { type: 'test', text: conceptText`Choose a replacement start.` },
  acceptStartingSelections: { type: 'test', text: conceptText`Accept the starting selections.` },
});
const areas = scenarioAreas([bundleSourcing, bundleCuration], { subAreas: [sourceSetupEdit, sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'aa046ed6-74f2-4249-af5d-5479b96797f3' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  const { editor, sources, bundleConfig, beforeConfig, originalOverview, originalStart } = await test.step(sections.steps.setup, async () => {
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
    return { editor, sources, bundleConfig, beforeConfig, originalOverview, originalStart };
  });

  await test.step(sections.steps.addFolderStart, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewNodeVisible('file:_mw_sources/source000003/Study.md', true));
    await sourceCommand(() => sources.open());
    await sourceCommand(() => sources.editStartingSelections());
    await sourceCommand(() => sources.addStartingSelection());
    await sourceCommand(() => sources.setStartingSelection(2, 'research', 'folder', 'Same'));
    await sourceCommand(() => addKeyFrame(startingSelection));
    await sourceCommand(() => checkpoint('the original file stays first when a source folder is added'));
  });

  const { collection, acceptedConfig } = await test.step(sections.steps.saveStartingSelectionsTheseFilesAreAlready, async () => {
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
    return { collection, acceptedConfig };
  });

  await test.step(sections.steps.removeRequiredPageStart, async () => {
    await sourceCommand(() => sourceChanges.apply('remove-required-start', 'multi-source'));
    await sourceCommand(() => sources.open());
    await sourceCommand(() => sources.editStartingSelections());
    await sourceCommand(() => expect(page.getByRole('textbox', { name: 'Path for starting selection 1', exact: true })).toHaveValue('Start.md'));
    expect(bundleConfig.readText()).toBe(acceptedConfig);
    await sourceCommand(() => checkpoint('the missing start remains selected until the user chooses its replacement'));
  });

  await test.step(sections.steps.chooseReplacementStart, async () => {
    await sourceCommand(() => sources.setStartingSelection(1, 'notes', 'file', 'Overview.md'));
    await sourceCommand(() => addKeyFrame(bundleSource, startingSelection));
    await sourceCommand(() => checkpoint('the replacement start is selected and ready to accept'));
  });

  await test.step(sections.steps.acceptStartingSelections, async () => {
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
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
