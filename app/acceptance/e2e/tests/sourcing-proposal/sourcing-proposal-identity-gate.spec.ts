/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewIdentity, sourceMove, pendingSourceProposal, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Enter a rename review and make one identity decision. Later and reload preserve that partial choice while blocking the graph until every identity is resolved.
 */
test('Sourcing requires identity decisions before graph entry and preserves partial review on Later', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const proposal = () => JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/proposal.json'), 'utf8'));
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  await checkpoint('accepted identities are configured before the rename batch');

  // --- Test start ---
  await sourceChanges.apply('rename-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  await expect(sourcing.identities).toBeVisible();
  await expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled();
  await expect(sourcing.root.getByRole('button', { name: 'List View', exact: true })).toHaveCount(0);
  await expect(sourcing.identities.getByTestId('source-move-100000000006').getByRole('radio', { name: /Same page/ })).toHaveCount(2);
  await sourcing.chooseIdentity('100000000002', 'Routes/Branch/Gateway.md');
  await addKeyFrame(sourceReviewIdentity);
  await checkpoint('the identity modal is open with one decision made and the others unresolved');

  // Closing the required gate returns to accepted curation and keeps the partial review.
  await sourcing.identities.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(sourcing.root).toBeHidden();
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await page.reload();
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await expect(sourcing.identities).toBeVisible();
  await expect(sourcing.identities.getByTestId('source-move-100000000002').getByRole('radio', { name: 'Same page — Routes/Branch/Gateway.md', exact: true })).toBeChecked();
  expect(Object.keys(proposal().identities)).toEqual(['100000000002']);
  await expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled();
  await checkpoint('reopening restores the partial identity review and still gates the graph');

  // Every remaining identity needs a choice before graph entry.
  await sourcing.chooseIdentity('100000000003', 'Routes/Independent.md');
  await sourcing.chooseIdentity('100000000007', null);
  await sourcing.chooseIdentity('100000000006', 'Retained One.md');
  await sourcing.continueToGraph();
  await sourcing.select('Gateway');
  await expect(sourcing.evidence).toContainText('Routes/Branch/Bridge.md');
  await expect(sourcing.evidence).toContainText('Routes/Branch/Gateway.md');
  await sourcing.expectNodeVisible('Bridge', false);
  await sourcing.expectNodeVisible('Leaf');
  await sourcing.expectNodeVisible('Petal');
  await sourcing.select('Leaf');
  await expect(sourcing.evidence).toContainText('source was missing');
  await sourcing.select('Petal');
  await expect(sourcing.evidence).toContainText('Newly included');
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await checkpoint('resolved identities are visible in the comparison without accepting the sources');
  await sourcing.accept();
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.find((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000002').bundleNodeName).toBe('Gateway');
  expect(nodes.some((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000007')).toBe(false);
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Petal').bundleNodeId).not.toBe('100000000007');
  await checkpoint('acceptance preserves confirmed identities and removes the rejected old configuration');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'] });
});
