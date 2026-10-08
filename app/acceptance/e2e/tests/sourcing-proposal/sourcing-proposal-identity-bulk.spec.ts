/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewIdentity, sourceMove, bundleNodeId, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing bulk-confirms unambiguous rename suggestions while ambiguous matches require choices`);

const description = linkedScenarioDescription(conceptText`Inspect every similarity criterion, confirm the strong rename, then decide weaker and competing identities separately. A rejected match stays two comparison nodes; confirmed moves retain one identity and both paths.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '92083d13-2373-432c-8fd9-600e73c0c653' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  const leaf = sourcing.identities.getByTestId('source-move-100000000007');
  const gateway = sourcing.identities.getByTestId('source-move-100000000002');
  const competing = sourcing.identities.getByTestId('source-move-100000000006');
  await sourceCommand(() => expect(sourcing.identities.getByRole('tab', { name: 'Confident suggestions', exact: true })).toHaveAttribute('aria-selected', 'true'));
  await sourceCommand(() => sourcing.showIdentity('100000000007'));
  await sourceCommand(() => expect(leaf.getByRole('radio', { name: /^Same$/ })).toBeChecked());
  await sourceCommand(() => expect(leaf.getByText('Recommended', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(gateway).toBeHidden());
  expect(proposal.current.identities).toEqual({});
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('confident suggestions are preselected for review before they are saved'));

  // Uncertain records show evidence and choices without a recommendation.
  await sourceCommand(() => sourcing.selectIdentityTab('Needs your input'));
  await sourceCommand(() => expect(sourcing.identities.getByRole('tabpanel', { name: 'Needs your input', exact: true }).getByRole('columnheader', { name: 'Choose', exact: true })).toBeVisible());
  await sourceCommand(() => expect(sourcing.identities.getByRole('tabpanel', { name: 'Needs your input', exact: true }).getByRole('combobox')).toHaveCount(0));
  await sourceCommand(() => sourcing.expectChoicesAlignedWithSummary('100000000002'));
  await sourceCommand(() => sourcing.expectPickRequired('100000000006'));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => sourcing.showIdentity('100000000006'));
  await sourceCommand(() => expect(competing.getByRole('radio', { name: 'Pick', exact: true })).toHaveCount(2));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => sourcing.showIdentity('100000000002'));
  await sourceCommand(() => expect(gateway.getByRole('radio', { checked: true })).toHaveCount(0));
  await sourceCommand(() => expect(sourcing.identities.getByRole('tabpanel', { name: 'Needs your input', exact: true })).not.toContainText('Recommended'));
  await sourceCommand(() => sourcing.toggleIdentitySimilarity('100000000002'));
  await sourceCommand(() => sourcing.expectChoicesAlignedWithSummary('100000000002'));
  await sourceCommand(() => expect(gateway).toContainText('not a probability'));
  await sourceCommand(() => expect(gateway.getByText('Identical non-blank file contents', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(gateway.getByText('Substantial blocks', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(gateway.getByText('Shared folder move', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(gateway).toContainText('Not applicable'));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => sourcing.toggleIdentitySimilarity('100000000002'));
  await sourceCommand(() => checkpoint('the input tab retains similarity and traversal evidence without suggested choices'));

  // Accepting confident suggestions preserves individual decisions in the other tab.
  await sourceCommand(() => gateway.getByTestId('source-identity-record-summary').click());
  await sourceCommand(() => sourcing.chooseInputIdentity('100000000002', null));
  await sourceCommand(() => expect(gateway.getByTestId('source-identity-record')).not.toHaveAttribute('open'));
  await sourceCommand(() => sourcing.expectInputIdentity('100000000002', null));
  await sourceCommand(() => sourcing.acceptAllIdentitySuggestions());
  await sourceCommand(() => expect(leaf.getByRole('radio', { name: /^Same$/ })).toBeChecked());
  await sourceCommand(() => expect(sourcing.identities.getByRole('button', { name: 'Accept all suggestions', exact: true })).toBeDisabled());
  await sourceCommand(() => sourcing.selectIdentityTab('Needs your input'));
  await sourceCommand(() => sourcing.expectInputIdentity('100000000002', null));
  await sourceCommand(() => expect(sourcing.identities.getByRole('button', { name: 'Continue to graph', exact: true })).toBeDisabled());
  expect(proposal.current.identities['100000000006']).toBeUndefined();
  expect(proposal.current.identities['100000000003']).toBeUndefined();
  await sourceCommand(() => checkpoint('accepting suggestions preserves the saved rejection and unresolved input records'));

  // Choose the uncertain matches, revise the confirmed suggestion, and select the competing destination.
  await sourceCommand(() => sourcing.chooseInputIdentity('100000000002', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.expectInputIdentity('100000000002', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.chooseIdentity('100000000003', 'Routes/Independent.md'));
  await sourceCommand(() => sourcing.chooseCompactIdentity('100000000007', 'Different'));
  await sourceCommand(() => sourcing.expectCompactIdentity('100000000007', 'Different'));
  await sourceCommand(() => sourcing.chooseInputIdentity('100000000006', 'Retained One.md'));
  await sourceCommand(() => sourcing.expectInputIdentity('100000000006', 'Retained One.md'));
  await sourceCommand(() => sourcing.continueToGraph());
  await sourceCommand(() => sourcing.select('Gateway'));
  await sourceCommand(() => sourcing.expectSelectedRename('Routes/Branch/Bridge.md', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.expectNodeVisible('Bridge', false));
  await sourceCommand(() => sourcing.expectNodeVisible('Leaf'));
  await sourceCommand(() => sourcing.expectNodeVisible('Petal'));
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => sourcing.expectSelectedRemovalReason('Source missing'));
  await sourceCommand(() => sourcing.select('Petal'));
  await sourceCommand(() => expect(sourcing.changeKind).toHaveText('Add'));
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await sourceCommand(() => checkpoint('resolved identities are visible in the comparison without accepting the sources'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.find((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000002').bundleNodeName).toBe('Gateway');
  expect(nodes.some((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000007')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Petal')).toBe(false);
  await sourceCommand(() => checkpoint('acceptance preserves confirmed identities and removes the rejected old configuration'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'] }));
});
