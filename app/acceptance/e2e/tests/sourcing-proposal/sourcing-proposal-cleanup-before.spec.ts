/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewCleanup, pendingSourceProposal, blacklist, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Reduce a bridge's depth, defer and reload, then reverse the boundary. Repeat with a blacklist.
 * Excluded pages retain their saved identity, tracking and traversal settings throughout the pending
 * proposal, and both reversal paths restore those settings before anything is accepted.
 */
test('Reversing pending scope exclusions restores saved page configuration before acceptance', { annotation: { type: 'scenario-id', description: '3edbe143-aa65-47b7-bdec-8422d2c3d888' } }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  const original = YAML.parse(saved).nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing');
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => checkpoint('configured pages are present before either provisional exclusion'));

  // --- Test start ---
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Orphaned configuration'));
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toEqual(original);
  await sourceCommand(() => checkpoint('the reduced depth leaves excluded page configuration in the pending proposal'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('departing'));
  await sourceCommand(() => checkpoint('reopening restores the excluded page and its pending cleanup evidence'));
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(3));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Unchanged source material'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toEqual(original);

  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedBlacklisted(true));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('departing'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedBlacklisted(false));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Unchanged source material'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toEqual(original);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await sourceCommand(() => addKeyFrame(sourceReviewCleanup));
  await sourceCommand(() => checkpoint('reversing both exclusions restores the saved identity tracking and depth settings'));
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Discard proposal', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  await sourceCommand(() => assertMeadowHomeState());
});
