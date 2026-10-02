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
 * Track safe additions, then refresh after their content starts matching sensitivity policy. Automatic choices become untracked without requiring explicit confirmation.
 * Checkpoints preserve the pending decisions and their current sensitivity evidence.
 */
test('Refreshing source material makes newly sensitive automatic tracking choices untracked', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const filters = new FilterPanelComponent(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Restricted review material', field: 'content', matchType: 'substring', value: 'review-sensitive', markSensitive: true });
  await sourceChanges.apply('add-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  for (const name of ['Safe One', 'Safe Two']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  }
  for (const name of ['Safe One', 'Safe Two']) expect(proposal.current.tracking[`file:Additions/${name}.md`]).toMatchObject({ track: true, origin: 'automatic' });
  const captured = proposal.current.candidateSnapshotId;
  await checkpoint('safe additions have pending automatic tracking choices');

  // --- Test start ---
  // Refresh incorporates changed bytes and revalidates the existing tracking decisions.
  await sourceChanges.apply('mark-review-pages-sensitive', 'sourcing-review-data');
  const comparisonResponse = page.waitForResponse(response => response.url().includes('/sourcing/proposal/graph?') && response.ok());
  await sourcing.updateSources();
  const comparison = await (await comparisonResponse).json();
  expect(comparison.graph.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One').body).toContain('review-sensitive');
  expect(proposal.current.candidateSnapshotId).not.toBe(captured);
  for (const name of ['Safe One', 'Safe Two']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
    await expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible();
    expect(proposal.current.tracking[`file:Additions/${name}.md`]).toMatchObject({ track: false, origin: 'automatic' });
    expect(proposal.current.tracking[`file:Additions/${name}.md`].needsConfirmation).not.toBe(true);
  }
  await expect(sourcing.root.getByRole('button', { name: /Review .* tracking choices/ })).toHaveCount(0);
  await addKeyFrame(sourceReviewSensitivity);
  await checkpoint('sensitive additions are untracked without an explicit-choice confirmation');
  await sourcing.accept();
  await editor.sourceReview.trackingNotice.expectSensitiveSkipped(3);
  await editor.sourceReview.trackingNotice.close();
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe Two')).toBe(false);
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Safe One');
  await editor.expectListViewRowByExactNamePresent('Safe Two');
  await filters.expectFilterVisible('Restricted review material');
  await checkpoint('accepted curation contains the reviewed material and the resolved tracking choices');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Additions/Safe One.md', 'source_graphs/sourcing-review-data/Additions/Safe Two.md'] });
});
