/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
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
test('Confirming a depth change incorporates newer sources and applies the edit together', async ({ page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await list.goto();
  await list.clickBundle('example-bundle');
  await editor.waitForLoad('example-bundle');
  await sourcing.open();
  await sourcing.select('Inversion');
  await sourcing.untrackSelected();
  await sourcing.select('Cognitive Biases');
  const directory = path.join(testServer.configDir, 'bundles/example-bundle');
  const proposal = () => JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/proposal.json'), 'utf8'));
  const before = proposal();
  const acceptedConfig = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  await checkpoint('the captured scope stops at Cognitive Biases with an explicit untrack choice');

  // --- Test start ---
  // Consent is required before the depth edit can capture the newly redirected link.
  await sourceChanges.apply('redirect-biases-link', 'example-bundle-data');
  const endConsentErrors = expectLogErrors(/This boundary change needs newer source material|server responded with a status of 409/);
  await sourcing.setSelectedOutlinkDepth(1);
  const confirmation = page.getByRole('dialog', { name: 'Update sources for this change?', exact: true });
  await expect(confirmation).toBeVisible();
  endConsentErrors();
  await addKeyFrame(sourceChangesDuringReview);
  await checkpoint('the depth refresh confirmation is open before updating the proposal');

  // Capture the new links and destination together, retaining the applicable earlier decision.
  await confirmation.getByRole('button', { name: 'Update sources and apply change', exact: true }).click();
  await expect(confirmation).toBeHidden();
  expect(proposal().candidateSnapshotId).not.toBe(before.candidateSnapshotId);
  expect(proposal().proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Cognitive Biases').outlinksDepth).toBe(1);
  expect(proposal().tracking['file:Inversion.md']).toMatchObject({ track: false, origin: 'explicit' });
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(acceptedConfig);
  await sourcing.compare('Confirmation Bias');
  await expect(sourcing.comparison).toContainText('This newly reviewed destination describes the tendency');
  await sourcing.closeComparison();
  await sourcing.expectNodeVisible('Availability Bias', false);
  await sourcing.compare('Cognitive Biases');
  await sourcing.expectAddedContent('**[[Confirmation Bias]]**');
  await checkpoint('one rebuilt proposal contains the revised links, new destination text, and staged depth');

  // Accept installs the coherent scope and the untrack choice together.
  await sourcing.closeComparison();
  await sourcing.accept();
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).not.toBe(acceptedConfig);
  await checkpoint('accepted sourcing contains the confirmed scope expansion');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/Confirmation Bias.md'] });
});
