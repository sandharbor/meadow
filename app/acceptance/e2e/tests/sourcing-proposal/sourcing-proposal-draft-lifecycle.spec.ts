/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, proposalConfigurationDraft, sourceReviewConfigurationMerge } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Stage traversal, tracking, a bundle filter and a global filter, then choose Later. Other bundles
 * retain their saved policy. A later accepted global filter and an external source change survive
 * reopening and discarding the original proposal; only that proposal's isolated drafts disappear.
 */
test('Sourcing preserves node and filter drafts on Later and discards them together', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const filters = new FilterPanelComponent(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const savedNodes = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  const globalPath = path.join(testServer.configDir, 'app/global_custom_filters.json');
  const savedGlobal = fs.readFileSync(globalPath, 'utf8');
  await sourcing.open();
  await checkpoint('the new proposal begins with the saved node and filter configuration');

  // --- Test start ---
  await sourcing.select('Bridge');
  await sourcing.setSelectedOutlinkDepth(0);
  await sourcing.select('Reference');
  await sourcing.untrackSelected();
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Draft bridge', field: 'title', matchType: 'substring', value: 'Bridge' });
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Draft shared emphasis', field: 'title', matchType: 'substring', value: 'Retained', scope: 'global' });
  const staged = proposal.current;
  expect(staged.proposed.bundleFilters.some((filter: { name: string }) => filter.name === 'Draft bridge')).toBe(true);
  expect(staged.proposed.globalFilters.some((filter: { name: string }) => filter.name === 'Draft shared emphasis')).toBe(true);
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(savedGlobal);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(savedNodes);
  await addKeyFrame(proposalConfigurationDraft);
  await checkpoint('node tracking bundle-filter and global-filter drafts accumulate in one proposal');
  await sourcing.later();
  await list.goto();
  await list.clickBundle('sourcing-folders');
  await editor.waitForLoad('sourcing-folders');
  await expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toHaveCount(0);
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Accepted later emphasis', field: 'title', matchType: 'substring', value: 'Reference', scope: 'global' });
  await sourceChanges.apply('remove-leaf-link', 'sourcing-review-data');
  const acceptedLaterGlobal = fs.readFileSync(globalPath, 'utf8');
  await checkpoint('another bundle uses saved policy and receives an independent accepted global filter');

  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await page.reload();
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await expect(page.getByRole('checkbox', { name: /Draft bridge/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Accepted later emphasis/ })).toBeVisible();
  expect(proposal.current.candidateSnapshotId).toBe(staged.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(staged.proposed);
  await sourcing.select('Reference');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await checkpoint('reopening restores all drafts alongside the independent saved filter');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    sourcing.root.getByRole('button', { name: 'Discard proposal', exact: true }).click(),
  ]);
  await expect(sourcing.root).toBeHidden();
  expect(proposal.exists).toBe(false);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(savedNodes);
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(acceptedLaterGlobal);
  expect(fs.readFileSync(path.join(testServer.sourceGraphsDir, 'sourcing-review-data/Start.md'), 'utf8')).toContain('The former leaf link has been removed.');
  await expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Accepted later emphasis/ })).toBeVisible();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Leaf');
  const rediscovered = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8'));
  expect(rediscovered.candidateId).toBeTruthy();
  expect(rediscovered.candidateId).not.toBe(staged.candidateSnapshotId);
  await checkpoint('discard removes only the proposal drafts and preserves later accepted edits and external files');
  // The later accepted filter retains its existing curation persistence behavior, and discovery
  // records a new candidate for the external edit after the discarded proposal has been removed.
  await assertMeadowHomeState({
    allowedUntracked: ['source_graphs/.source-changes.jsonl', 'bundles/sourcing-folders/raw/folder_scope_snapshot.json', `bundles/sourcing-review/raw/sourcing/snapshots/${rediscovered.candidateId}/`],
    allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'app/global_custom_filters.json', 'bundles/sourcing-review/raw/sourcing/state.json'],
  });
});
