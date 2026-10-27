/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewIdentity, sourceReviewFiltering, sourceReviewWorkspace, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourceIdentity });
const name = linkedScenarioName(conceptText`Moves and renames overlap while empty-page identities use name frequency and incoming links`);
const description = linkedScenarioDescription(conceptText`Unique empty names receive a likely-move suggestion; common names and changed incoming links require a choice. Move changes directory, Rename changes filename, and a page can match both while counting once in the total. Acceptance preserves all confirmed identities.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a fixture with tracked pages and empty pages, including an unreachable namesake elsewhere in its source directory.` },
  identity: { type: 'test', text: conceptText`Inspect unique-name, common-name, and changed-link evidence before confirming page identities.` },
  categories: { type: 'test', text: conceptText`Inspect Move, Rename, and combined summaries and verify overlapping sections count each page once in the overall total.` },
  filters: { type: 'test', text: conceptText`Solo Move and Rename independently, then together, without changing the proposal; accept the confirmed identities.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity, sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '7b8dce45-84e0-4f6a-869c-28a0122c7f56' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, filters } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect), editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect), filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('source-identity'));
    await sourceCommand(() => editor.waitForLoad('source-identity'));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('tracked identities and empty-page names are captured before source changes'));
    return { editor, sourcing, filters };
  });
  await test.step(sections.steps.identity, async () => {
    await sourceCommand(() => sourceChanges.apply('move-rename-empty-pages', 'source-identity-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.expectIdentityEvidence('200000000006', 'Likely renamed', 'Filename occurs 1 time(s) before and 1 time(s) after'));
    await sourceCommand(() => sourcing.expectIdentityEvidence('200000000007', 'Choose a match', 'Filename occurs 2 time(s) before and 2 time(s) after'));
    await sourceCommand(() => sourcing.expectIdentityEvidence('200000000008', 'Choose a match', 'The recorded link sets differ.'));
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('unique names support a move while common names and conflicting incoming links remain uncertain'));
    await sourceCommand(() => sourcing.decideIdentity('200000000007', 'New/Common Empty.md'));
    await sourceCommand(() => sourcing.decideIdentity('200000000008', 'New/Changed Links Empty.md'));
    await sourceCommand(() => sourcing.confirmIdentities());
  });
  await test.step(sections.steps.categories, async () => {
    await sourceCommand(() => filters.expectSourceChangeCount('Move', 5));
    await sourceCommand(() => filters.expectSourceChangeCount('Rename', 2));
    await sourceCommand(() => sourcing.select('Move Only'));
    await sourceCommand(() => sourcing.expectSelectedChangeSummary('Move Only', 'Move'));
    await sourceCommand(() => sourcing.select('Renamed Only'));
    await sourceCommand(() => sourcing.expectSelectedChangeSummary('Renamed Only', 'Rename'));
    await sourceCommand(() => sourcing.select('Both Renamed'));
    await sourceCommand(() => sourcing.expectSelectedMoveAndRename());
    await sourceCommand(() => sourcing.expectSelectedRename('Old/Both.md', 'New/Both Renamed.md'));
    await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
    await sourceCommand(() => sourcing.expectPageChangeCategories(8, {
      Move: ['Both Renamed', 'Changed Links Empty', 'Common Empty', 'Move Only', 'Unique Empty'],
      Rename: ['Both Renamed', 'Renamed Only'],
      Modify: ['Bridge', 'Start'],
    }));
    await sourceCommand(() => addKeyFrame(sourceReviewFiltering));
    await sourceCommand(() => checkpoint('the combined page appears in both categories and once in the eight-page total'));
    await sourceCommand(() => sourcing.closeAcceptedChangeDetail());
    await sourceCommand(() => sourcing.clearSelection());
  });
  await test.step(sections.steps.filters, async () => {
    await sourceCommand(() => filters.clickSoloOnFilter('Move'));
    await sourceCommand(() => editor.expectListViewRowCount(5));
    await sourceCommand(() => filters.clickSoloOnFilter('Move'));
    await sourceCommand(() => filters.clickSoloOnFilter('Rename'));
    await sourceCommand(() => editor.expectListViewRowCount(2));
    await sourceCommand(() => filters.clickSoloOnFilter('Move'));
    await sourceCommand(() => editor.expectListViewRowCount(6));
    await sourceCommand(() => checkpoint('Move and Rename solos include the combined page without duplicating its row'));
    await sourceCommand(() => sourcing.accept());
    const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles/source-identity/config/bundle_node_config.yaml'), 'utf8')) as { nodes: Array<{ bundleNodeId: string; bundleNodeName: string; sourceGraphSubdirectory: string; listType: string }> };
    expect(config.nodes.find(node => node.bundleNodeId === '200000000005')).toMatchObject({ bundleNodeName: 'Both Renamed', sourceGraphSubdirectory: 'New', listType: 'whitelist' });
    for (const id of ['200000000006', '200000000007', '200000000008']) expect(config.nodes.find(node => node.bundleNodeId === id)).toMatchObject({ sourceGraphSubdirectory: 'New', listType: 'whitelist' });
    await sourceCommand(() => checkpoint('acceptance preserves identities and tracking across moves and renames'));
  });
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/source-identity-data/New/', 'source_graphs/source-identity-data/Old/Renamed Only.md'], allowedModified: ['source_graphs/source-identity-data/Start.md', 'source_graphs/source-identity-data/Bridge.md', 'source_graphs/source-identity-data/Old/Move Only.md', 'source_graphs/source-identity-data/Old/Rename Only.md', 'source_graphs/source-identity-data/Old/Both.md', 'source_graphs/source-identity-data/Old/Unique Empty.md', 'source_graphs/source-identity-data/Old/Common Empty.md', 'source_graphs/source-identity-data/Old/Changed Links Empty.md'] }));
});
