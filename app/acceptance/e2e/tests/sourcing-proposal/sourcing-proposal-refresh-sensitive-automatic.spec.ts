/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewSensitivity, sensitive, filterSensitivity, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Review untracked additions, then refresh after their content starts matching sensitivity policy. Untracked additions remain untracked without requiring explicit confirmation.
 * Checkpoints preserve the pending decisions and their current sensitivity evidence.
 */
test('Refreshing source material keeps newly sensitive additions untracked', { annotation: { type: 'scenario-id', description: '63b363d7-248b-4c3b-a136-7cc5dffb7754' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Restricted review material', field: 'content', matchType: 'substring', value: 'review-sensitive', markSensitive: true }));
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
  // Refresh incorporates changed bytes and revalidates the existing tracking decisions.
  await sourceCommand(() => sourceChanges.apply('mark-review-pages-sensitive', 'sourcing-review-data'));
  const comparisonResponse = page.waitForResponse(response => response.url().includes('/sourcing/proposal/graph?') && response.ok());
  await sourceCommand(() => sourcing.updateSources());
  const comparison = await sourceCommand(async () => (await comparisonResponse).json());
  expect(comparison.graph.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One').body).toContain('review-sensitive');
  expect(proposal.current.candidateSnapshotId).not.toBe(captured);
  for (const name of ['Safe One', 'Safe Two']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible());
    expect(proposal.current.tracking[`file:Additions/${name}.md`]).toBeUndefined();
  }
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: /Review .* tracking choices/ })).toHaveCount(0));
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
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Additions/Safe One.md', 'source_graphs/sourcing-review-data/Additions/Safe Two.md'] }));
});
