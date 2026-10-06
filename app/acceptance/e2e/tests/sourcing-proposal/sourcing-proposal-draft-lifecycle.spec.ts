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
test('Sourcing preserves node and filter drafts on Later and discards them together', { annotation: { type: 'scenario-id', description: 'c4ae489a-82e5-46c2-b64e-64e07f42afdb' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const savedNodes = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  const globalPath = path.join(testServer.configDir, 'app/global_custom_filters.json');
  const savedGlobal = fs.readFileSync(globalPath, 'utf8');
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => checkpoint('the new proposal begins with the saved node and filter configuration'));

  // --- Test start ---
  // Keep the main choices visible and secondary actions in a keyboard-accessible menu.
  await sourceCommand(() => sourcing.expectMainReviewActions());
  await sourceCommand(() => expect(sourcing.reviewActionsMenu).toBeHidden());
  await sourceCommand(() => sourcing.reviewActionsButton.press('ArrowDown'));
  const rescan = sourcing.reviewActionsMenu.getByRole('menuitem', { name: 'Rescan sources', exact: true });
  const discard = sourcing.reviewActionsMenu.getByRole('menuitem', { name: 'Discard proposal', exact: true });
  await sourceCommand(() => expect(rescan).toBeFocused());
  await sourceCommand(() => rescan.press('ArrowDown'));
  await sourceCommand(() => expect(discard).toBeFocused());
  await sourceCommand(() => addKeyFrame(pendingSourceProposal));
  await sourceCommand(() => discard.press('Escape'));
  await sourceCommand(() => expect(sourcing.reviewActionsMenu).toBeHidden());
  await sourceCommand(() => expect(sourcing.reviewActionsButton).toBeFocused());
  await sourceCommand(() => sourcing.openReviewActions());
  await sourceCommand(() => sourcing.root.getByRole('heading', { name: 'Sourcing · sourcing-review', exact: true }).click());
  await sourceCommand(() => expect(sourcing.reviewActionsMenu).toBeHidden());
  await sourceCommand(() => checkpoint('review actions are grouped and the menu closes with Escape or an outside click'));

  // Stage changes and leave the review with its proposal intact.
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Draft bridge', field: 'title', matchType: 'substring', value: 'Bridge' }));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Draft shared emphasis', field: 'title', matchType: 'substring', value: 'Retained', scope: 'global' }));
  const staged = proposal.current;
  expect(staged.proposed.bundleFilters.some((filter: { name: string }) => filter.name === 'Draft bridge')).toBe(true);
  expect(staged.proposed.globalFilters.some((filter: { name: string }) => filter.name === 'Draft shared emphasis')).toBe(true);
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(savedGlobal);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(savedNodes);
  await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
  await sourceCommand(() => checkpoint('node tracking bundle-filter and global-filter drafts accumulate in one proposal'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-folders'));
  await sourceCommand(() => editor.waitForLoad('sourcing-folders'));
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toHaveCount(0));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Accepted later emphasis', field: 'title', matchType: 'substring', value: 'Reference', scope: 'global' }));
  await sourceCommand(() => sourceChanges.apply('remove-leaf-link', 'sourcing-review-data'));
  const acceptedLaterGlobal = fs.readFileSync(globalPath, 'utf8');
  await sourceCommand(() => checkpoint('another bundle uses saved policy and receives an independent accepted global filter'));

  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Draft bridge/ })).toBeVisible());
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toBeVisible());
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Accepted later emphasis/ })).toBeVisible());
  expect(proposal.current.candidateSnapshotId).toBe(staged.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(staged.proposed);
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('reopening restores all drafts alongside the independent saved filter'));
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    sourcing.discard(),
  ]));
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  expect(proposal.exists).toBe(false);
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(savedNodes);
  expect(fs.readFileSync(globalPath, 'utf8')).toBe(acceptedLaterGlobal);
  expect(fs.readFileSync(path.join(testServer.sourceGraphsDir, 'sourcing-review-data/Start.md'), 'utf8')).toContain('The former leaf link has been removed.');
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Draft shared emphasis/ })).toHaveCount(0));
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: /Accepted later emphasis/ })).toBeVisible());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Leaf'));
  const rediscovered = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8'));
  expect(rediscovered.candidateId).toBeTruthy();
  expect(rediscovered.candidateId).not.toBe(staged.candidateSnapshotId);
  await sourceCommand(() => checkpoint('discard removes only the proposal drafts and preserves later accepted edits and external files'));
  // The later accepted filter retains its existing curation persistence behavior, and discovery
  // records a new candidate for the external edit after the discarded proposal has been removed.
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ['source_graphs/.source-changes.jsonl', 'bundles/sourcing-folders/raw/folder_scope_snapshot.json', `bundles/sourcing-review/raw/sourcing/snapshots/${rediscovered.candidateId}/`],
    allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'app/global_custom_filters.json', 'bundles/sourcing-review/raw/sourcing/state.json'],
  }));
});
