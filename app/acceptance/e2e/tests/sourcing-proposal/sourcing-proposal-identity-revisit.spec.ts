/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourceReviewIdentity, sourceChangesDuringReview, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Identity review is required until decided, then revisitable, and required again for new identities`);

const description = linkedScenarioDescription(conceptText`The first identity review dims the editor and stays open until Confirm or Cancel. Once
every file is decided, reopening it from its chip shows Cancel, which closes only the panel, and Update, which
applies edited decisions. A refresh that brings a new uncertain rename makes identity review required again.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'cce81862-5cfe-4ddd-9ed5-915904993c7a' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => checkpoint('accepted identities are configured before any rename'));

  // --- Test start ---
  // The first visit is required: the editor dims, and neither the dimmed area nor Escape closes the panel.
  await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.identities).toBeVisible());
  await sourceCommand(() => expect(sourcing.identities).toHaveAttribute('aria-modal', 'true'));
  await sourceCommand(() => expect(sourcing.identityBackdrop).toBeVisible());
  await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeDisabled());
  await sourceCommand(() => sourcing.identityBackdrop.click({ position: { x: 40, y: 300 } }));
  await sourceCommand(() => page.keyboard.press('Escape'));
  await sourceCommand(() => expect(sourcing.identities).toBeVisible());
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => checkpoint('the first identity review is required and stays open'));

  await sourceCommand(() => sourcing.decideIdentity('100000000002', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.decideIdentity('100000000003', 'Routes/Independent.md'));
  await sourceCommand(() => sourcing.decideIdentity('100000000006', 'Retained One.md'));
  await sourceCommand(() => sourcing.confirmIdentities());
  await sourceCommand(() => expect(sourcing.root.getByTestId('source-changes-filter-group')).toBeVisible());
  await sourceCommand(() => checkpoint('confirming the decisions opens the graph'));

  // A revisit is not required: Cancel closes only the panel, and Update waits for an edit.
  await sourceCommand(() => sourcing.openIdentities());
  await sourceCommand(() => expect(sourcing.identityBackdrop).toHaveCount(0));
  await sourceCommand(() => expect(sourcing.identities).not.toHaveAttribute('aria-modal', 'true'));
  await sourceCommand(() => expect(sourcing.identitySection('Already decided').getByTestId(/^source-move-/)).toHaveCount(4));
  await sourceCommand(() => expect(sourcing.identityButton('Update')).toBeDisabled());
  await sourceCommand(() => sourcing.identityButton('Cancel').click());
  await sourceCommand(() => expect(sourcing.identities).toBeHidden());
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled());
  await sourceCommand(() => checkpoint('cancelling a revisit closes only identity review'));

  await sourceCommand(() => sourcing.openIdentities());
  await sourceCommand(() => sourcing.decideIdentity('100000000003', null));
  await sourceCommand(() => expect(sourcing.identityButton('Update')).toBeEnabled());
  expect(proposal.current.identities['100000000003']).toBe('Routes/Independent.md');
  await sourceCommand(() => sourcing.updateIdentities());
  expect(proposal.current.identities['100000000003']).toBeNull();
  await sourceCommand(() => sourcing.openIdentities());
  await sourceCommand(() => sourcing.expectIdentityDecision('100000000003', 'New page'));
  await sourceCommand(() => sourcing.identityButton('Cancel').click());
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => checkpoint('a revisit changes an earlier decision only when Update is chosen'));

  // A refresh that brings a new uncertain rename makes identity review required again.
  await sourceCommand(() => sourceChanges.apply('rename-outside-with-edits', 'sourcing-review-data'));
  await sourceCommand(() => sourcing.refreshIdentitySources());
  await sourceCommand(() => expect(sourcing.identities).toBeVisible());
  await sourceCommand(() => expect(sourcing.identityBackdrop).toBeVisible());
  await sourceCommand(() => expect(sourcing.identitySection('Choose a match').getByTestId('source-move-100000000005')).toBeVisible());
  await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeDisabled());
  await sourceCommand(() => addKeyFrame(sourceChangesDuringReview));
  await sourceCommand(() => checkpoint('a refresh with a new identity makes review required again'));

  await sourceCommand(() => sourcing.decideIdentity('100000000005', 'Beyond.md'));
  await sourceCommand(() => sourcing.confirmIdentities());
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes as Array<{ bundleNodeId: string; bundleNodeName: string }>;
  expect(nodes.find(node => node.bundleNodeId === '100000000005')?.bundleNodeName).toBe('Beyond');
  expect(nodes.some(node => node.bundleNodeId === '100000000003')).toBe(false);
  await sourceCommand(() => checkpoint('acceptance applies the revised and the newly required decisions'));
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Beyond.md', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'],
    allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Departing.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Outside.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'],
  }));
});
