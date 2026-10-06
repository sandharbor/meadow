/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
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
test('Sourcing requires identity decisions before graph entry and preserves partial review on Later', { annotation: { type: 'scenario-id', description: '9fbb91cb-48e4-43dc-b5a2-72864118bd2d' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  await sourceCommand(() => checkpoint('accepted identities are configured before the rename batch'));

  // --- Test start ---
  await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.identities).toBeVisible());
  await sourceCommand(() => expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled());
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'List View', exact: true })).toHaveCount(0));
  await sourceCommand(() => sourcing.selectIdentityTab('Needs your input'));
  await sourceCommand(() => sourcing.showIdentity('100000000006'));
  await sourceCommand(() => expect(sourcing.identities.getByTestId('source-move-100000000006').getByRole('radio', { name: /Same page/ })).toHaveCount(2));
  await sourceCommand(() => sourcing.chooseIdentity('100000000002', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => checkpoint('the identity modal is open with one decision made and the others unresolved'));

  // Closing the required gate returns to accepted curation and keeps the partial review.
  await sourceCommand(() => sourcing.identities.getByRole('button', { name: 'Later', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.identities).toBeVisible());
  await sourceCommand(() => sourcing.showIdentity('100000000002'));
  await sourceCommand(() => expect(sourcing.identities.getByTestId('source-move-100000000002').getByRole('radio', { name: 'Same page — Routes/Branch/Gateway.md', exact: true })).toBeChecked());
  expect(Object.keys(proposal.current.identities)).toEqual(['100000000002']);
  await sourceCommand(() => expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled());
  await sourceCommand(() => checkpoint('reopening restores the partial identity review and still gates the graph'));

  // Every remaining identity needs a choice before graph entry.
  await sourceCommand(() => sourcing.chooseIdentity('100000000003', 'Routes/Independent.md'));
  await sourceCommand(() => sourcing.chooseIdentity('100000000007', null));
  await sourceCommand(() => sourcing.chooseIdentity('100000000006', 'Retained One.md'));
  await sourceCommand(() => sourcing.continueToGraph());
  await sourceCommand(() => sourcing.select('Gateway'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Routes/Branch/Bridge.md'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.expectNodeVisible('Bridge', false));
  await sourceCommand(() => sourcing.expectNodeVisible('Leaf'));
  await sourceCommand(() => sourcing.expectNodeVisible('Petal'));
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('source was missing'));
  await sourceCommand(() => sourcing.select('Petal'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Newly included'));
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await sourceCommand(() => checkpoint('resolved identities are visible in the comparison without accepting the sources'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.find((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000002').bundleNodeName).toBe('Gateway');
  expect(nodes.some((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000007')).toBe(false);
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Petal').bundleNodeId).not.toBe('100000000007');
  await sourceCommand(() => checkpoint('acceptance preserves confirmed identities and removes the rejected old configuration'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'] }));
});
