/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, bundleSource, startingSelection, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source initial creation captures ordered mixed selections without an extra acceptance step`);

const description = linkedScenarioDescription(conceptText`Create a bundle from ordered page and folder selections across sources. The initial
capture should preserve that order without asking for another acceptance step.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'ae17062f-0f31-4721-9594-504a8391aa6b' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickCreateNewBundle());
  const dialog = page.getByRole('dialog', { name: 'Create New Bundle', exact: true });
  await sourceCommand(() => dialog.getByRole('radio', { name: /Sources and mixed starts/ }).click());
  await sourceCommand(() => dialog.getByRole('textbox', { name: 'Bundle home title', exact: true }).fill('Multi-source created'));
  for (const [index, name] of ['notes', 'research', 'reference'].entries()) {
    await sourceCommand(() => dialog.getByRole('button', { name: 'Add source', exact: true }).click());
    await sourceCommand(() => dialog.getByRole('textbox', { name: `Source name ${index + 1}`, exact: true }).fill(name));
    await sourceCommand(() => dialog.getByRole('textbox', { name: `Source directory ${index + 1}`, exact: true }).fill(path.join(testServer.sourceGraphsDir, 'multi-source', name)));
  }
  const createModal = new CreateAndEditBundleModal(page, expect);
  await sourceCommand(() => createModal.chooseStartingSelectionPath(1, 'Sta', 'Start', 'Start.md'));
  await sourceCommand(() => dialog.getByRole('button', { name: 'Add starting selection', exact: true }).click());
  await sourceCommand(() => dialog.getByRole('combobox', { name: 'Source for starting selection 2', exact: true }).selectOption({ label: 'research' }));
  await sourceCommand(() => dialog.getByRole('combobox', { name: 'Kind for starting selection 2', exact: true }).selectOption('folder'));
  await sourceCommand(() => createModal.chooseStartingSelectionPath(2, 'sa', 'Same', 'Same'));
  await sourceCommand(() => dialog.getByRole('spinbutton', { name: 'Default outlink depth', exact: true }).fill('2'));
  await sourceCommand(() => dialog.getByRole('spinbutton', { name: 'Default inlink depth', exact: true }).fill('1'));
  await sourceCommand(() => addKeyFrame(bundleSource, startingSelection));
  await sourceCommand(() => checkpoint('sources define admission while ordered files and folders define the starts'));

  // --- Test start ---
  // Create the bundle.
  await sourceCommand(() => dialog.getByRole('button', { name: 'Create Bundle', exact: true }).click());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-created'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.sourceReview.expectClosed());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-created', expect);
  const config = bundleConfig.read();
  const nodes = bundleConfig.readNodes();
  expect(config.sources).toHaveLength(3);
  const entry = nodes.find(node => node.bundleNodeId === config.entryBundleNodeId)!;
  expect(entry.bundleNodeKind).toBe('collection');
  expect(entry.bundleNodeKind === 'collection' && entry.memberBundleNodeIds.map(id => {
    const node = nodes.find(node => node.bundleNodeId === id)!;
    return [node.bundleNodeKind, node.bundleNodeName, config.sources?.find(source => source.id === node.sourceId)?.name];
  })).toEqual([['file', 'Start', 'notes'], ['folder', 'Same', 'research']]);
  expect(nodes).toHaveLength(3);
  const lookup = async (source: string) => {
    const query = new URLSearchParams({ pageName: 'Start', sourceDirectory: path.join(testServer.sourceGraphsDir, 'multi-source', source), folderPath: '' });
    const response = await page.request.get(`/api/bundles/multi-source-created/tracks-page?${query}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).tracks;
  };
  expect(await sourceCommand(() => lookup('notes'))).toBe(true);
  expect(await sourceCommand(() => lookup('research'))).toBe(false);
  await sourceCommand(() => addKeyFrame(startingSelection));
  await sourceCommand(() => checkpoint('initial creation captures the sources and preserves initial tracking rules'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
