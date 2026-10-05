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
test('Source-change filters alter only presentation and expose removal reasons and evidence', { annotation: { type: 'scenario-id', description: 'cf10d7e1-184d-4c62-b964-54361693c518' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => checkpoint('accepted material contains the original routes and identities'));

  // --- Test start ---
  await sourceCommand(() => sourceChanges.apply('review-mixed-changes', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.chooseIdentity('100000000003', 'Routes/Reference Renamed.md'));
  await sourceCommand(() => sourcing.continueToGraph());
  await sourceCommand(() => filters.expandFilterGroup('Removed'));
  for (const [name, count] of [['Added', 1], ['Renamed', 1], ['Modified', 2], ['Removed', 3], ['Source missing', 1], ['Not reachable', 2], ['Disconnected', 0], ['Unchanged', 1]] as const) {
    await sourceCommand(() => filters.expectSourceChangeCount(name, count));
  }
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('source was missing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Orphaned configuration'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Start → Leaf'));
  await sourceCommand(() => sourcing.expectNodeExplanation('Leaf', /source was missing/));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('No longer reachable'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Start → Bridge → Departing'));
  await sourceCommand(() => sourcing.compare('Bridge'));
  await sourceCommand(() => sourcing.expectAddedContent('The route to Departing is no longer included.'));
  await sourceCommand(() => checkpoint('captured evidence distinguishes a missing file from the removed route'));
  await sourceCommand(() => sourcing.closeComparison());
  await sourceCommand(() => sourcing.select('Reference Renamed'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Routes/Reference.md'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Routes/Reference Renamed.md'));
  await sourceCommand(() => sourcing.expectNodeVisible('Reference', false));
  await sourceCommand(() => sourcing.clearSelection());
  const reviewed = proposal.current;
  await sourceCommand(() => addKeyFrame(sourceReviewFiltering));
  await sourceCommand(() => checkpoint('each category has an exact count and the confirmed rename is one comparison node'));

  // Solo and hide can combine with folder filters without changing any proposal decisions.
  await sourceCommand(() => filters.clickSoloOnFilter('Removed'));
  await sourceCommand(() => editor.expectListViewRowCount(3));
  await sourceCommand(() => filters.clickSoloOnFilter('Removed'));
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.expandFolder('Routes'));
  await sourceCommand(() => filters.soloFolder('Routes'));
  await sourceCommand(() => filters.clickSoloOnFilter('Modified'));
  await sourceCommand(() => filters.hideFolder('Routes/Branch'));
  await sourceCommand(() => sourcing.expectNodeVisible('Reference Renamed'));
  await sourceCommand(() => sourcing.expectNodeVisible('Bridge', false));
  await sourceCommand(() => sourcing.expectNodeVisible('Leaf', false));
  expect(proposal.current).toEqual(reviewed);
  await sourceCommand(() => checkpoint('combined category and folder presentation leaves the complete proposal unchanged'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  for (const name of ['Leaf', 'Departing', 'Outside', 'Reference']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference Renamed')?.bundleNodeId).toBe('100000000003');
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe One'));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Reference Renamed'));
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Leaf'));
  await sourceCommand(() => checkpoint('acceptance applies hidden additions modifications rename and all cleanup'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Routes/Reference Renamed.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md', 'source_graphs/sourcing-review-data/Leaf.md'] }));
});
