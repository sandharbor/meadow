/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewSensitivity, sourceReviewConfigurationMerge, sensitive, filterSensitivity, tracking, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Defer a proposal, change accepted sensitivity policy, and reopen the same capture. Explicit choices block acceptance until one is reconfirmed and the other is removed.
 * Checkpoints preserve the pending decisions and their current sensitivity evidence.
 */
test('Deferred proposals revalidate explicit tracking after accepted sensitivity policy changes', { annotation: { type: 'scenario-id', description: 'c540d2c8-9d88-4810-8960-58e8682e9447' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const filters = new FilterPanelComponent(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  for (const name of ['Safe One', 'Safe Two']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => sourcing.trackSelected());
  }
  for (const name of ['Safe One', 'Safe Two']) expect(proposal.current.tracking[`file:Additions/${name}.md`]).toMatchObject({ track: true, origin: 'explicit' });
  const captured = proposal.current.candidateSnapshotId;
  await sourceCommand(() => checkpoint('safe additions have pending explicit tracking choices'));

  // --- Test start ---
  // Reopening must assess saved policy against the original capture.
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Restricted review material', field: 'title', matchType: 'substring', value: 'Safe', markSensitive: true, scope: 'global' }));
  await sourceCommand(() => checkpoint('accepted global sensitivity policy changes while the proposal is deferred'));
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  expect(proposal.current.candidateSnapshotId).toBe(captured);
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeDisabled());
  for (const name of ['Safe One', 'Safe Two']) expect(proposal.current.tracking[`file:Additions/${name}.md`]).toMatchObject({ origin: 'explicit', needsConfirmation: true });
  await sourceCommand(() => sourcing.reviewTrackingChoices(2));
  await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('Restricted review material'));
  await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
  await sourceCommand(() => checkpoint('renewed sensitivity review is open with both explicit choices unresolved'));

  // Exercise both decisions against the current material and policy.
  await sourceCommand(() => sourcing.resolveSensitiveTracking('Safe One.md', true));
  await sourceCommand(() => sourcing.resolveSensitiveTracking('Safe Two.md', false));
  await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('All tracking choices reviewed.'));
  await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.select('Safe Two'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('one sensitive page is explicitly reconfirmed and the other is left untracked'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe Two')).toBe(false);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe One'));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe Two'));
  await sourceCommand(() => filters.expectFilterVisible('Restricted review material'));
  await sourceCommand(() => checkpoint('accepted curation contains the reviewed material and the resolved tracking choices'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
