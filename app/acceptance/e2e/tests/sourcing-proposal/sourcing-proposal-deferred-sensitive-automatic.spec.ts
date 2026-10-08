/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewSensitivity, sensitive, filterSensitivity, tracking, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Deferred proposals keep additions untracked when accepted sensitivity policy changes`);

const description = linkedScenarioDescription(conceptText`Defer a proposal, change accepted sensitivity policy, and reopen the same capture. Untracked additions remain untracked without requiring explicit confirmation.
Checkpoints preserve the pending decisions and their current sensitivity evidence.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '3e04d1b9-c0b5-4cc8-add8-195f0b7d1537' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  }
  for (const name of ['Safe One', 'Safe Two']) expect(proposal.current.tracking[`file:Additions/${name}.md`]).toBeUndefined();
  const captured = proposal.current.candidateSnapshotId;
  await sourceCommand(() => checkpoint('safe additions start untracked'));

  // --- Test start ---
  // Reopening must assess saved policy against the original capture.
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Restricted review material', field: 'title', matchType: 'substring', value: 'Safe', markSensitive: true, scope: 'bundle' }));
  await sourceCommand(() => checkpoint('accepted bundle sensitivity policy changes while the proposal is deferred'));
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  expect(proposal.current.candidateSnapshotId).toBe(captured);
  for (const name of ['Safe One', 'Safe Two']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible());
    expect(proposal.current.tracking[`file:Additions/${name}.md`]).toBeUndefined();
  }
  await sourceCommand(() => sourcing.expectNoTrackingConfirmations());
  await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
  await sourceCommand(() => checkpoint('sensitive additions are untracked without an explicit-choice confirmation'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe Two')).toBe(false);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe One'));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe Two'));
  await sourceCommand(() => filters.expectFilterVisible('Restricted review material'));
  await sourceCommand(() => checkpoint('accepted curation contains the reviewed material and the resolved tracking choices'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
