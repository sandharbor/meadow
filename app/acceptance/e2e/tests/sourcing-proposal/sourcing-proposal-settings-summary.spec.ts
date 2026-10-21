/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourcingReviewRedesign, proposalConfigurationDraft, sourceReviewWorkspace, tracking, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing summarizes staged settings and tracking edits without adding a graph change category`);

const description = linkedScenarioDescription(conceptText`Review a changed source alongside staged traversal, tracking, bundle and global filters. The
tray attached to Accept changes counts the page changes, staged settings, and tracking changes; each
item opens readable details, including before/after values, global scope, and pages that can be
selected in the graph. Soloing Untracked changes presentation, while acceptance still applies the
complete proposal.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: ordinary source changes are visible before staging additional settings.` },
  verifyScenarioTrayUnderAcceptChangesLists: { type: 'test', text: conceptText`Verify the scenario: the tray under Accept changes lists each kind of staged change.` },
  inspectStagedSettings: { type: 'test', text: conceptText`Inspect the staged settings.` },
  inspectStagedTrackingChangeRemovalsUntrackPages: { type: 'test', text: conceptText`Inspect the staged tracking change; removals that untrack pages follow behind a toggle.` },
  inspectPageChangeTray: { type: 'test', text: conceptText`Inspect a page change from the tray.` },
  soloUntrackedPages: { type: 'test', text: conceptText`Solo untracked pages.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd1647330-ccf7-428a-8bb5-87e69537129a' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { sourcing, filters } = await test.step(sections.steps.setup, async () => {
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
    return { sourcing, filters };
  });

  await test.step(sections.steps.verifyScenarioTrayUnderAcceptChangesLists, async () => {
    await sourceCommand(() => sourcing.select('Bridge'));
    await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
    await sourceCommand(() => sourcing.select('Reference'));
    await sourceCommand(() => sourcing.untrackSelected());
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Bridge emphasis', field: 'title', matchType: 'substring', value: 'Bridge' }));
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Shared retained review', field: 'title', matchType: 'substring', value: 'Retained', scope: 'global' }));
    await sourceCommand(() => sourcing.expectAcceptedChanges([/^\d+ page changes$/, '3 setting changes', '4 tracking changes']));
    await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
    await sourceCommand(() => checkpoint('the tray under Accept changes lists each kind of staged change'));
  });

  const { settings } = await test.step(sections.steps.inspectStagedSettings, async () => {
    const settings = await sourceCommand(() => sourcing.openAcceptedChangeDetail('3 setting changes', 'Setting changes'));
    await sourceCommand(() => expect(settings).toContainText('Outlink depth'));
    await sourceCommand(() => expect(settings).toContainText('Before this proposal'));
    await sourceCommand(() => expect(settings).toContainText('Default'));
    await sourceCommand(() => expect(settings).toContainText('Bridge emphasis'));
    await sourceCommand(() => expect(settings).toContainText('Shared retained review'));
    await sourceCommand(() => expect(settings).toContainText('All bundles'));
    await sourceCommand(() => expect(settings).not.toContainText('Reference'));
    await sourceCommand(() => expect(settings).not.toContainText('bundleNodeId'));
    await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
    await sourceCommand(() => checkpoint('setting changes show each staged setting before and after'));
    return { settings };
  });

  await test.step(sections.steps.inspectStagedTrackingChangeRemovalsUntrackPages, async () => {
    const trackingChanges = await sourceCommand(() => sourcing.openAcceptedChangeDetail('4 tracking changes', 'Tracking changes'));
    await sourceCommand(() => expect(settings).toBeHidden());
    const untracked = trackingChanges.getByTestId('tracking-change').filter({ hasText: 'Reference' });
    await sourceCommand(() => expect(untracked).toContainText('Not Tracked'));
    await sourceCommand(() => expect(trackingChanges.getByTestId('tracking-removal')).toHaveCount(0));
    await sourceCommand(() => trackingChanges.getByTestId('tracking-removals-toggle').click());
    await sourceCommand(() => expect(trackingChanges.getByTestId('tracking-removal')).toHaveCount(3));
    await sourceCommand(() => expect(trackingChanges.getByTestId('tracking-removal').first()).toContainText('Not Tracked (removed)'));
    await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
    await sourceCommand(() => checkpoint('tracking changes show the untracked page and the removals that untrack pages'));
  });

  await test.step(sections.steps.inspectPageChangeTray, async () => {
    const pageChanges = await sourceCommand(() => sourcing.openAcceptedChangeDetail(/^\d+ page changes$/, 'Page changes'));
    await sourceCommand(() => expect(pageChanges.getByRole('region', { name: 'Modify', exact: true })).toContainText('Start'));
    await sourceCommand(() => expect(pageChanges.getByRole('region', { name: 'Remove', exact: true })).toContainText('Leaf'));
    await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
    await sourceCommand(() => sourcing.selectAcceptedPageChange('Leaf'));
    await sourceCommand(() => sourcing.expectSelectedChangeSummary('Leaf', 'Remove'));
    await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
    await sourceCommand(() => checkpoint('selecting a page change in the tray selects it in the graph'));
  });

  await test.step(sections.steps.soloUntrackedPages, async () => {
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
  });

  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
