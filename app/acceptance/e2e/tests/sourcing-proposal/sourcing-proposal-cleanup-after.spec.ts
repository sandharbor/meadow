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
test('Acceptance cleans unreachable configuration for both scope exclusions and external orphans', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const nodes = () => YAML.parse(fs.readFileSync(configPath, 'utf8')).nodes as Array<{ bundleNodeId: string; bundleNodeName: string; listType: string; outlinksDepth?: number }>;
  const original = nodes();
  await checkpoint('accepted configuration includes the bridge dependents and the externally linked leaf');

  // --- Test start ---
  await sourceChanges.apply('remove-leaf-link', 'sourcing-review-data');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    page.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
  ]);
  await sourcing.open();
  await sourcing.select('Bridge');
  await sourcing.setSelectedBlacklisted(true);
  for (const name of ['Leaf', 'Departing', 'Outside']) {
    await sourcing.select(name);
    await expect(sourcing.evidence).toContainText('departing');
    await expect(sourcing.evidence).toContainText('Orphaned configuration');
    await expect(sourcing.evidence).toContainText('No longer reachable');
  }
  expect(nodes()).toEqual(original);
  await expect(page.getByRole('button', { name: 'Keep in config', exact: true })).toHaveCount(0);
  await addKeyFrame(sourceReviewCleanup);
  await checkpoint('both external and intentional departures require cleanup on acceptance');
  await sourcing.accept();
  for (const name of ['Leaf', 'Departing', 'Outside']) expect(nodes().some(node => node.bundleNodeName === name)).toBe(false);
  expect(nodes().find(node => node.bundleNodeName === 'Bridge')?.listType).toBe('blacklist');
  for (const name of ['Leaf', 'Departing', 'Outside']) expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'sourcing-review-data', `${name}.md`))).toBe(true);
  await checkpoint('accepted configuration is cleaned while the blacklist and external files remain');

  await editor.switchToListView();
  await editor.rightClickRow('Bridge');
  await page.getByRole('button', { name: 'Remove from Blacklist', exact: true }).click();
  await expect(sourcing.root).toBeVisible();
  await sourcing.root.getByRole('checkbox', { name: 'Track non-sensitive added pages', exact: true }).uncheck();
  await sourcing.select('Departing');
  await expect(sourcing.evidence).toContainText('Newly included');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await checkpoint('returning pages have fresh tracking choices without the cleaned override');
  await sourcing.accept();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Departing');
  await editor.expectListViewRowByExactNameNotPresent('Leaf');
  expect(nodes().some(node => node.bundleNodeName === 'Departing')).toBe(false);
  await checkpoint('accepted re-expansion admits returning material without resurrecting its old configuration');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
