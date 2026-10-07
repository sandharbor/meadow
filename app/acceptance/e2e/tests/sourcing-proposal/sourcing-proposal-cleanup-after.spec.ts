/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewCleanup, sourceReviewAcceptance, orphan, blacklist, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Combine a staged bridge exclusion with an externally removed leaf link. Acceptance removes both
 * unreachable configurations, retains the causal blacklist, and leaves source files untouched.
 * Re-expansion has fresh tracking decisions and cannot revive the cleaned page's depth override.
 */
test('Acceptance cleans unreachable configuration for both scope exclusions and external orphans', { annotation: { type: 'scenario-id', description: '98d3a524-50f8-46a4-9213-a5404ef8c6ce' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const nodes = () => YAML.parse(fs.readFileSync(configPath, 'utf8')).nodes as Array<{ bundleNodeId: string; bundleNodeName: string; listType: string; outlinksDepth?: number }>;
  const original = nodes();
  await sourceCommand(() => checkpoint('accepted configuration includes the bridge dependents and the externally linked leaf'));

  // --- Test start ---
  await sourceCommand(() => sourceChanges.apply('remove-leaf-link', 'sourcing-review-data'));
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    page.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
  ]));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedBlacklisted(true));
  for (const name of ['Leaf', 'Departing', 'Outside']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Removed'));
    await sourceCommand(() => sourcing.expectSelectedRemovalReason('Not reachable'));
  }
  expect(nodes()).toEqual(original);
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Keep in config', exact: true })).toHaveCount(0));
  await sourceCommand(() => addKeyFrame(sourceReviewCleanup));
  await sourceCommand(() => checkpoint('both external and intentional departures require cleanup on acceptance'));
  await sourceCommand(() => sourcing.accept());
  for (const name of ['Leaf', 'Departing', 'Outside']) expect(nodes().some(node => node.bundleNodeName === name)).toBe(false);
  expect(nodes().find(node => node.bundleNodeName === 'Bridge')?.listType).toBe('blacklist');
  for (const name of ['Leaf', 'Departing', 'Outside']) expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'sourcing-review-data', `${name}.md`))).toBe(true);
  await sourceCommand(() => checkpoint('accepted configuration is cleaned while the blacklist and external files remain'));

  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.rightClickRow('Bridge'));
  await sourceCommand(() => page.getByRole('button', { name: 'Remove from Blacklist', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  await sourceCommand(() => sourcing.expectNoAutomaticTrackingOption());
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Added'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('returning pages have fresh tracking choices without the cleaned override'));
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Departing'));
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Leaf'));
  expect(nodes().some(node => node.bundleNodeName === 'Departing')).toBe(false);
  await sourceCommand(() => checkpoint('accepted re-expansion admits returning material without resurrecting its old configuration'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
