/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewIdentity, sourceMove, bundleNodeId } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Confirm the unambiguous rename group, then decide the competing identity separately. A rejected match stays two comparison nodes; confirmed moves retain one identity and both paths.
 */
test('Sourcing bulk-confirms unambiguous rename suggestions while ambiguous matches require choices', { annotation: { type: 'scenario-id', description: '92083d13-2373-432c-8fd9-600e73c0c653' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  await sourceCommand(() => expect(sourcing.identities.getByTestId('source-move-100000000006').getByRole('radio', { name: /Same page/ })).toHaveCount(2));
  await sourceCommand(() => expect(sourcing.identities).toContainText('Identical file contents'));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => checkpoint('identity gate offers three unambiguous renames and two competing destinations'));

  // Bulk confirmation cannot select either competing destination.
  await sourceCommand(() => sourcing.identities.getByRole('button', { name: 'Confirm 3 unambiguous suggestions', exact: true }).click());
  await sourceCommand(() => expect(sourcing.identities.getByTestId('source-move-100000000002').getByRole('radio', { name: 'Same page — Routes/Branch/Gateway.md', exact: true })).toBeChecked());
  await sourceCommand(() => expect(sourcing.identities.getByTestId('source-move-100000000003').getByRole('radio', { name: 'Same page — Routes/Independent.md', exact: true })).toBeChecked());
  await sourceCommand(() => expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled());
  expect(proposal.current.identities['100000000006']).toBeUndefined();
  await sourceCommand(() => checkpoint('bulk confirmation preserves the unresolved competing identity'));

  // Reject one suggested identity and explicitly select the competing destination.
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
