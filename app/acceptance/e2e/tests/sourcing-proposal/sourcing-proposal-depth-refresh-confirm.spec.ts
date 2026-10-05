/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, pendingProposalRevalidation, sourceChangesDuringReview, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * Change a stopped page's live link and its destination, then increase the proposed depth. Confirm
 * the refresh and verify the new capture contains both the revised links and destination bytes,
 * retains an applicable untrack decision, and leaves accepted curation unchanged until acceptance.
 */
test('Confirming a depth change incorporates newer sources and applies the edit together', { annotation: { type: 'scenario-id', description: '51af7817-6b84-4f0e-b058-b20b13fe27c4' } }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'example-bundle');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('example-bundle'));
  await sourceCommand(() => editor.waitForLoad('example-bundle'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Inversion'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.select('Cognitive Biases'));
  const directory = path.join(testServer.configDir, 'bundles/example-bundle');
  const before = proposal.current;
  const acceptedConfig = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  await sourceCommand(() => checkpoint('the captured scope stops at Cognitive Biases with an explicit untrack choice'));

  // --- Test start ---
  // Consent is required before the depth edit can capture the newly redirected link.
  await sourceCommand(() => sourceChanges.apply('redirect-biases-link', 'example-bundle-data'));
  const endConsentErrors = expectLogErrors(/This boundary change needs newer source material|server responded with a status of 409/);
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(1));
  const confirmation = page.getByRole('dialog', { name: 'Update sources for this change?', exact: true });
  await sourceCommand(() => expect(confirmation).toBeVisible());
  endConsentErrors();
  await sourceCommand(() => addKeyFrame(sourceChangesDuringReview));
  await sourceCommand(() => checkpoint('the depth refresh confirmation is open before updating the proposal'));

  // Capture the new links and destination together, retaining the applicable earlier decision.
  await sourceCommand(() => confirmation.getByRole('button', { name: 'Update sources and apply change', exact: true }).click());
  await sourceCommand(() => expect(confirmation).toBeHidden());
  expect(proposal.current.candidateSnapshotId).not.toBe(before.candidateSnapshotId);
  expect(proposal.current.proposed.nodes.find(node => node.bundleNodeName === 'Cognitive Biases')?.outlinksDepth).toBe(1);
  expect(proposal.current.tracking['file:Inversion.md']).toMatchObject({ track: false, origin: 'explicit' });
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(acceptedConfig);
  await sourceCommand(() => sourcing.compare('Confirmation Bias'));
  await sourceCommand(() => expect(sourcing.comparison).toContainText('This newly reviewed destination describes the tendency'));
  await sourceCommand(() => sourcing.closeComparison());
  await sourceCommand(() => sourcing.expectNodeVisible('Availability Bias', false));
  await sourceCommand(() => sourcing.compare('Cognitive Biases'));
  await sourceCommand(() => sourcing.expectAddedContent('**[[Confirmation Bias]]**'));
  await sourceCommand(() => checkpoint('one rebuilt proposal contains the revised links, new destination text, and staged depth'));

  // Accept installs the coherent scope and the untrack choice together.
  await sourceCommand(() => sourcing.closeComparison());
  await sourceCommand(() => sourcing.accept());
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).not.toBe(acceptedConfig);
  await sourceCommand(() => checkpoint('accepted sourcing contains the confirmed scope expansion'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/Confirmation Bias.md'] }));
});
