/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewConfigurationMerge } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * A proposal's traversal edits merge with later curation presentation and independent saved fields.
 * Direct edits of the user's saved configuration simulate another client, including equal outcomes.
 * A competing depth requires review again if that saved value changes after conflict resolution.
 */
test('Sourcing merges independent configuration edits and treats equal outcomes as nonconflicting', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
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
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await checkpoint('the original saved page configuration has inherited traversal');

  // --- Test start ---
  await sourcing.open();
  for (const name of ['Leaf', 'Reference']) {
    await sourcing.select(name);
    await sourcing.setSelectedOutlinkDepth(0);
    await expect(sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeEnabled();
  }
  await sourcing.later();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('Leaf');
  await page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click();
  await editor.switchToGraphView();
  await editor.expectLabelVisible('Leaf');
  saveLeaf({ outlinksDepth: 0, inlinksDepth: 1 });
  await sourcing.open();
  await expect(sourcing.root.getByRole('button', { name: /Resolve .* configuration conflicts/ })).toHaveCount(0);
  await addKeyFrame(sourceReviewConfigurationMerge);
  await checkpoint('unchanged and equal saved fields merge with independent traversal and curation labels');
  await sourcing.accept();
  expect(leaf()).toMatchObject({ outlinksDepth: 0, inlinksDepth: 1 });
  expect(nodes().find(node => node.bundleNodeName === 'Reference')?.outlinksDepth).toBe(0);
  await editor.expectLabelVisible('Leaf');
  await checkpoint('compatible acceptance retains both traversal fields and the later presentation choice');

  // A saved edit to the same field competes with the second proposal.
  await sourcing.open();
  await sourcing.select('Leaf');
  await sourcing.setSelectedOutlinkDepth(1);
  await sourcing.later();
  saveLeaf({ outlinksDepth: 2, inlinksDepth: 2 });
  await sourcing.open();
  await sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click();
  const conflict = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
  await expect(conflict).toContainText('Leaf');
  await expect(conflict).toContainText('Outlink depth');
  await checkpoint('competing traversal depths require an explicit choice');
  await conflict.getByRole('button', { name: 'Use proposed', exact: true }).click();
  await expect(conflict).toContainText('All conflicts resolved.');
  await expect(sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeEnabled();
  saveLeaf({ outlinksDepth: 3 });
  await checkpoint('another saved edit arrives while the resolved conflict dialog remains open');
  await conflict.getByRole('button', { name: 'Close', exact: true }).click();
  const stopExpectedErrors = expectLogErrors(/This proposal changed|server responded with a status of 409/);
  await sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true }).click();
  await expect(sourcing.root.getByRole('alert')).toContainText('Review it again before accepting');
  stopExpectedErrors();
  expect(leaf()).toMatchObject({ outlinksDepth: 3, inlinksDepth: 2 });
  await sourcing.later();
  await sourcing.open();
  await sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click();
  await expect(conflict).toContainText('3');
  await addKeyFrame(pendingProposalRevalidation);
  await checkpoint('the changed saved value invalidates the old resolution and is open for renewed review');
  await conflict.getByRole('button', { name: 'Use proposed', exact: true }).click();
  await expect(conflict).toContainText('All conflicts resolved.');
  await conflict.getByRole('button', { name: 'Close', exact: true }).click();
  await sourcing.accept();
  expect(leaf()).toMatchObject({ outlinksDepth: 1, inlinksDepth: 2 });
  await editor.expectLabelVisible('Leaf');
  await checkpoint('renewed acceptance applies the chosen depth and preserves unrelated later changes');
  await assertMeadowHomeState();
});
