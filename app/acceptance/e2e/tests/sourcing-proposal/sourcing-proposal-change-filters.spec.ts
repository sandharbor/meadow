/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewFiltering, sourceReviewAcceptance, orphan, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * One capture includes additions, modifications, a rename, missing and unreachable departures, and
 * unchanged context. Orphans overlap the departures rather than inflating their count. Category and
 * folder solos/hides affect only the view; acceptance still installs the entire reviewed proposal.
 */
test('Source-change filters alter only presentation and expose removal reasons and evidence', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await checkpoint('accepted material contains the original routes and identities');

  // --- Test start ---
  await sourceChanges.apply('review-mixed-changes', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  await sourcing.chooseIdentity('100000000003', 'Routes/Reference Renamed.md');
  await sourcing.continueToGraph();
  await filters.expandFilterGroup('Removed');
  for (const [name, count] of [['Added', 1], ['Renamed', 1], ['Modified', 2], ['Removed', 3], ['Source missing', 1], ['Not reachable', 2], ['Disconnected', 0], ['Unchanged', 1]] as const) {
    await filters.expectSourceChangeCount(name, count);
  }
  await sourcing.select('Leaf');
  await expect(sourcing.evidence).toContainText('source was missing');
  await expect(sourcing.evidence).toContainText('Orphaned configuration');
  await expect(sourcing.evidence).toContainText('Start → Leaf');
  await sourcing.expectNodeExplanation('Leaf', /source was missing/);
  await sourcing.select('Departing');
  await expect(sourcing.evidence).toContainText('No longer reachable');
  await expect(sourcing.evidence).toContainText('Start → Bridge → Departing');
  await sourcing.compare('Bridge');
  await sourcing.expectAddedContent('The route to Departing is no longer included.');
  await checkpoint('captured evidence distinguishes a missing file from the removed route');
  await sourcing.closeComparison();
  await sourcing.select('Reference Renamed');
  await expect(sourcing.evidence).toContainText('Routes/Reference.md');
  await expect(sourcing.evidence).toContainText('Routes/Reference Renamed.md');
  await sourcing.expectNodeVisible('Reference', false);
  await sourcing.clearSelection();
  const reviewed = proposal.current;
  await addKeyFrame(sourceReviewFiltering);
  await checkpoint('each category has an exact count and the confirmed rename is one comparison node');

  // Solo and hide can combine with folder filters without changing any proposal decisions.
  await filters.clickSoloOnFilter('Removed');
  await editor.expectListViewRowCount(3);
  await filters.clickSoloOnFilter('Removed');
  await filters.expandFilterGroup('Folders');
  await filters.expandFolder('Routes');
  await filters.soloFolder('Routes');
  await filters.clickSoloOnFilter('Modified');
  await filters.hideFolder('Routes/Branch');
  await sourcing.expectNodeVisible('Reference Renamed');
  await sourcing.expectNodeVisible('Bridge', false);
  await sourcing.expectNodeVisible('Leaf', false);
  expect(proposal.current).toEqual(reviewed);
  await checkpoint('combined category and folder presentation leaves the complete proposal unchanged');
  await sourcing.accept();
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  for (const name of ['Leaf', 'Departing', 'Outside', 'Reference']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference Renamed')?.bundleNodeId).toBe('100000000003');
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Safe One');
  await editor.expectListViewRowByExactNamePresent('Reference Renamed');
  await editor.expectListViewRowByExactNameNotPresent('Leaf');
  await checkpoint('acceptance applies hidden additions modifications rename and all cleanup');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Routes/Reference Renamed.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md', 'source_graphs/sourcing-review-data/Leaf.md'] });
});
