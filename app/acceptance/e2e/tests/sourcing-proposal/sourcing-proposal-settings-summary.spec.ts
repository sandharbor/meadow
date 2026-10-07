/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, proposalConfigurationDraft, sourceReviewWorkspace, tracking, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing summarizes staged settings and tracking edits without adding a graph change category`);

const description = linkedScenarioDescription(conceptText`Review a changed source alongside staged traversal, tracking, bundle and global filters. The
header counts the staged settings and tracking choices, and its expanded summary shows readable
before/after values and global scope. Soloing Untracked changes presentation, while acceptance
still applies the complete proposal.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd1647330-ccf7-428a-8bb5-87e69537129a' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourceChanges.apply('remove-leaf-link', 'sourcing-review-data'));
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.ok()),
    page.getByRole('button', { name: 'Refresh sources', exact: true }).click(),
  ]));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => checkpoint('ordinary source changes are visible before staging additional settings'));

  // --- Test start ---
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Bridge emphasis', field: 'title', matchType: 'substring', value: 'Bridge' }));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Shared retained review', field: 'title', matchType: 'substring', value: 'Retained', scope: 'global' }));
  const summaryButton = sourcing.root.getByRole('button', { name: 'Settings and tracking · 3 settings · 1 tracking choices', exact: true });
  await sourceCommand(() => expect(summaryButton).toBeVisible());
  await sourceCommand(() => expect(summaryButton).toHaveAttribute('aria-expanded', 'false'));
  await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
  await sourceCommand(() => checkpoint('compact settings and tracking counts sit beside the proposal actions'));
  await sourceCommand(() => summaryButton.click());
  const summary = sourcing.root.getByRole('region', { name: 'Proposal settings summary', exact: true });
  await sourceCommand(() => expect(summary).toContainText('Outlink depth'));
  await sourceCommand(() => expect(summary).toContainText('Before this proposal'));
  await sourceCommand(() => expect(summary).toContainText('Default'));
  await sourceCommand(() => expect(summary).toContainText('Untracked'));
  await sourceCommand(() => expect(summary).toContainText('Bridge emphasis'));
  await sourceCommand(() => expect(summary).toContainText('Shared retained review'));
  await sourceCommand(() => expect(summary).toContainText('All bundles'));
  await sourceCommand(() => expect(summary).not.toContainText('bundleNodeId'));
  await sourceCommand(() => checkpoint('expanded review names each staged setting and shows its before and after values'));
  await sourceCommand(() => summaryButton.click());
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(sourcing.root.getByRole('checkbox', { name: /Staged decision/ })).toHaveCount(0));
  await sourceCommand(() => checkpoint('the ordinary Untracked filter shows an unchanged page with a staged untrack choice'));
  await sourceCommand(() => sourcing.accept());
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review/config');
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Bridge').outlinksDepth).toBe(0);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference')).toBe(false);
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'custom_filters.json'), 'utf8')).filters.some((filter: { name: string }) => filter.name === 'Bridge emphasis')).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'app/global_custom_filters.json'), 'utf8')).filters.some((filter: { name: string }) => filter.name === 'Shared retained review')).toBe(true);
  await sourceCommand(() => checkpoint('acceptance applies all settings filters tracking and source changes despite the solo'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
