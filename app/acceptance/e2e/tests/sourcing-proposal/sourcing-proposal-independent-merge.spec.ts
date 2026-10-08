/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewConfigurationMerge, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing merges independent configuration edits and treats equal outcomes as nonconflicting`);

const description = linkedScenarioDescription(conceptText`A proposal's traversal edits merge with later curation presentation and independent saved fields.
Direct edits of the user's saved configuration simulate another client, including equal outcomes.
A competing depth requires review again if that saved value changes after conflict resolution.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '459afd83-d7c3-46e6-8ae4-2cb6b22a6c27' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filename = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const nodes = () => YAML.parse(fs.readFileSync(filename, 'utf8')).nodes as { bundleNodeName: string; outlinksDepth?: number; inlinksDepth?: number }[];
  const leaf = () => nodes().find(node => node.bundleNodeName === 'Leaf')!;
  const saveLeaf = (depths: { outlinksDepth: number; inlinksDepth?: number }) => {
    const config = YAML.parse(fs.readFileSync(filename, 'utf8'));
    Object.assign(config.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf'), depths);
    fs.writeFileSync(filename, YAML.stringify(config));
  };
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.openByLink('sourcing-review'));
  await sourceCommand(() => checkpoint('the original saved page configuration has inherited traversal'));

  // --- Test start ---
  for (const name of ['Leaf', 'Reference']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
    await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled());
  }
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('Leaf'));
  await sourceCommand(() => page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click());
  await sourceCommand(() => editor.switchToGraphView());
  await sourceCommand(() => editor.expectLabelVisible('Leaf'));
  saveLeaf({ outlinksDepth: 0, inlinksDepth: 1 });
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: /Resolve .* configuration conflicts/ })).toHaveCount(0));
  await sourceCommand(() => addKeyFrame(sourceReviewConfigurationMerge));
  await sourceCommand(() => checkpoint('unchanged and equal saved fields merge with independent traversal and curation labels'));
  await sourceCommand(() => sourcing.accept());
  expect(leaf()).toMatchObject({ outlinksDepth: 0, inlinksDepth: 1 });
  expect(nodes().find(node => node.bundleNodeName === 'Reference')?.outlinksDepth).toBe(0);
  await sourceCommand(() => editor.expectLabelVisible('Leaf'));
  await sourceCommand(() => checkpoint('compatible acceptance retains both traversal fields and the later presentation choice'));

  // A depth change in curation stages a second proposal; a saved edit to the same field competes with it.
  await sourceCommand(() => editor.switchToListView());
  // Leaf is still selected from the earlier label check; select it alone.
  await sourceCommand(() => editor.clickSelectNone());
  await sourceCommand(() => editor.clickListViewRowByExactName('Leaf'));
  const leafDetail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => leafDetail.openDetails());
  await sourceCommand(() => leafDetail.setOutlinksDepthOverride(1));
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.switchToGraphView());
  saveLeaf({ outlinksDepth: 2, inlinksDepth: 2 });
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.resolveConflicts(1));
  const conflict = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
  await sourceCommand(() => expect(conflict).toContainText('Leaf'));
  await sourceCommand(() => expect(conflict).toContainText('Outlink depth'));
  await sourceCommand(() => checkpoint('competing traversal depths require an explicit choice'));
  await sourceCommand(() => conflict.getByRole('button', { name: 'Use proposed', exact: true }).click());
  await sourceCommand(() => expect(conflict).toContainText('All conflicts resolved.'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled());
  saveLeaf({ outlinksDepth: 3 });
  await sourceCommand(() => checkpoint('another saved edit arrives while the resolved conflict dialog remains open'));
  await sourceCommand(() => conflict.getByRole('button', { name: 'Close', exact: true }).click());
  const stopExpectedErrors = expectLogErrors(/This proposal changed|server responded with a status of 409/);
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Accept changes', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root.getByRole('alert')).toContainText('Review it again before accepting'));
  stopExpectedErrors();
  expect(leaf()).toMatchObject({ outlinksDepth: 3, inlinksDepth: 2 });
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.resolveConflicts(1));
  await sourceCommand(() => expect(conflict).toContainText('3'));
  await sourceCommand(() => addKeyFrame(pendingProposalRevalidation));
  await sourceCommand(() => checkpoint('the changed saved value invalidates the old resolution and is open for renewed review'));
  await sourceCommand(() => conflict.getByRole('button', { name: 'Use proposed', exact: true }).click());
  await sourceCommand(() => expect(conflict).toContainText('All conflicts resolved.'));
  await sourceCommand(() => conflict.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => sourcing.accept());
  expect(leaf()).toMatchObject({ outlinksDepth: 1, inlinksDepth: 2 });
  await sourceCommand(() => editor.expectLabelVisible('Leaf'));
  await sourceCommand(() => checkpoint('renewed acceptance applies the chosen depth and preserves unrelated later changes'));
  await sourceCommand(() => assertMeadowHomeState());
});
