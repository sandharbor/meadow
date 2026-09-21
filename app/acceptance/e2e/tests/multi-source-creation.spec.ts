/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { bundleSource, startingSelection } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

test('Multi-source initial creation captures ordered mixed selections without an extra acceptance step', async ({ page, testServer, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickCreateNewBundle();
  const dialog = page.getByRole('dialog', { name: 'Create New Bundle', exact: true });
  await dialog.getByRole('radio', { name: /Sources and mixed starts/ }).click();
  await dialog.getByRole('textbox', { name: 'Bundle home title', exact: true }).fill('Multi-source created');
  for (const [index, name] of ['notes', 'research', 'reference'].entries()) {
    await dialog.getByRole('button', { name: 'Add source', exact: true }).click();
    await dialog.getByRole('textbox', { name: `Source name ${index + 1}`, exact: true }).fill(name);
    await dialog.getByRole('textbox', { name: `Source directory ${index + 1}`, exact: true }).fill(path.join(testServer.sourceGraphsDir, 'multi-source', name));
  }
  await dialog.getByRole('textbox', { name: 'Path for starting selection 1', exact: true }).fill('Start.md');
  await dialog.getByRole('button', { name: 'Add starting selection', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Source for starting selection 2', exact: true }).selectOption({ label: 'research' });
  await dialog.getByRole('combobox', { name: 'Kind for starting selection 2', exact: true }).selectOption('folder');
  await dialog.getByRole('textbox', { name: 'Path for starting selection 2', exact: true }).fill('Same');
  await dialog.getByRole('spinbutton', { name: 'Default outlink depth', exact: true }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Default inlink depth', exact: true }).fill('1');
  await addKeyFrame(bundleSource, startingSelection);
  await snapshot('sources define admission while ordered files and folders define the starts');
  await dialog.getByRole('button', { name: 'Create Bundle', exact: true }).click();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-created');
  await editor.waitForSourceCheck();
  await editor.sourceReview.expectClosed();
  const configDir = path.join(testServer.configDir, 'bundles/multi-source-created/config');
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'bundle_config.yaml'), 'utf8'));
  const nodes = parseBundleNodeConfig(fs.readFileSync(path.join(configDir, 'bundle_node_config.yaml'), 'utf8'));
  expect(config.sources).toHaveLength(3);
  const entry = nodes.find(node => node.bundleNodeId === config.entryBundleNodeId)!;
  expect(entry.bundleNodeKind).toBe('collection');
  expect(entry.bundleNodeKind === 'collection' && entry.memberBundleNodeIds.map(id => {
    const node = nodes.find(node => node.bundleNodeId === id)!;
    return [node.bundleNodeKind, node.bundleNodeName, config.sources.find((source: { id: string }) => source.id === node.sourceId).name];
  })).toEqual([['file', 'Start', 'notes'], ['folder', 'Same', 'research']]);
  expect(nodes).toHaveLength(3);
  const lookup = async (source: string) => {
    const query = new URLSearchParams({ pageName: 'Start', sourceDirectory: path.join(testServer.sourceGraphsDir, 'multi-source', source), folderPath: '' });
    const response = await page.request.get(`/api/bundles/multi-source-created/tracks-page?${query}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).tracks;
  };
  expect(await lookup('notes')).toBe(true);
  expect(await lookup('research')).toBe(false);
  await addKeyFrame(startingSelection);
  await snapshot('initial creation captures the sources and preserves initial tracking rules');
  await skipMeadowHomeStateCheck();
});
