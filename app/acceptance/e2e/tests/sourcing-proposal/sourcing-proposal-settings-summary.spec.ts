/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, proposalConfigurationDraft, sourceReviewWorkspace, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Review a changed source alongside staged traversal, tracking, bundle and global filters. The
 * header counts the staged settings and tracking choices, and its expanded summary shows readable
 * before/after values and global scope. Soloing Untracked changes presentation, while acceptance
 * still applies the complete proposal.
 */
test('Sourcing summarizes staged settings and tracking edits without adding a graph change category', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourceChanges.apply('remove-leaf-link', 'sourcing-review-data');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    page.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
  ]);
  await sourcing.open();
  await checkpoint('ordinary source changes are visible before staging additional settings');

  // --- Test start ---
  await sourcing.select('Bridge');
  await sourcing.setSelectedOutlinkDepth(0);
  await sourcing.select('Reference');
  await sourcing.untrackSelected();
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Bridge emphasis', field: 'title', matchType: 'substring', value: 'Bridge' });
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Shared retained review', field: 'title', matchType: 'substring', value: 'Retained', scope: 'global' });
  const summaryButton = sourcing.root.getByRole('button', { name: 'Settings and tracking · 3 settings · 1 tracking choices', exact: true });
  await expect(summaryButton).toBeVisible();
  await expect(summaryButton).toHaveAttribute('aria-expanded', 'false');
  await addKeyFrame(proposalConfigurationDraft);
  await checkpoint('compact settings and tracking counts sit beside the proposal actions');
  await summaryButton.click();
  const summary = sourcing.root.getByRole('region', { name: 'Proposal settings summary', exact: true });
  await expect(summary).toContainText('Outlink depth');
  await expect(summary).toContainText('Before this proposal');
  await expect(summary).toContainText('Default');
  await expect(summary).toContainText('Untracked');
  await expect(summary).toContainText('Bridge emphasis');
  await expect(summary).toContainText('Shared retained review');
  await expect(summary).toContainText('All bundles');
  await expect(summary).not.toContainText('bundleNodeId');
  await checkpoint('expanded review names each staged setting and shows its before and after values');
  await summaryButton.click();
  await filters.enableAndSoloFilter('Untracked');
  await sourcing.select('Reference');
  await expect(sourcing.evidence).toContainText('Unchanged source material');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await expect(sourcing.root.getByRole('checkbox', { name: /Staged decision/ })).toHaveCount(0);
  await checkpoint('the ordinary Untracked filter shows an unchanged page with a staged untrack choice');
  await sourcing.accept();
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review/config');
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Bridge').outlinksDepth).toBe(0);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference')).toBe(false);
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'custom_filters.json'), 'utf8')).filters.some((filter: { name: string }) => filter.name === 'Bridge emphasis')).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'app/global_custom_filters.json'), 'utf8')).filters.some((filter: { name: string }) => filter.name === 'Shared retained review')).toBe(true);
  await checkpoint('acceptance applies all settings filters tracking and source changes despite the solo');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
