/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Refreshing sources preserves an explicit decision to leave an addition untracked`);
const description = linkedScenarioDescription(conceptText`Leave one safe addition untracked through the ordinary selection controls while Track added pages remains on.
Refresh sources and accept: that explicit untrack survives, while another safe addition still follows the automatic tracking policy.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: two safe additions start tracked with automatic tracking enabled.` },
  overrideAutomaticTrackingForOneAdditionWithout: { type: 'test', text: conceptText`Override automatic tracking for one addition without turning the preference off.` },
  refreshMustPreserveOverrideWhileContinuingTrack: { type: 'test', text: conceptText`Refresh must preserve the override while continuing to track the other safe addition.` },
  acceptancePersistsOverrideMakesItAvailableFor: { type: 'test', text: conceptText`Acceptance persists the override and makes it available for ordinary curation.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '9be967e0-107e-4e85-9223-4f67e83810ca' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, proposal, filters } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'sourcing-review');
    const filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.expectTrackAdditions(true));
    for (const title of ['Safe One', 'Safe Two']) {
      await sourceCommand(() => sourcing.select(title));
      await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
    }
    await sourceCommand(() => checkpoint('two safe additions start tracked with automatic tracking enabled'));
    return { editor, sourcing, proposal, filters };
  });

  await test.step(sections.steps.overrideAutomaticTrackingForOneAdditionWithout, async () => {
    await sourceCommand(() => sourcing.select('Safe Two'));
    await sourceCommand(() => sourcing.untrackSelected());
    expect(proposal.current.tracking['file:Additions/Safe Two.md']).toMatchObject({ origin: 'explicit', track: false });
    await sourceCommand(() => sourcing.expectTrackAdditions(true));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
    await sourceCommand(() => checkpoint('explicit untracking overrides the still-enabled automatic preference'));
  });

  await test.step(sections.steps.refreshMustPreserveOverrideWhileContinuingTrack, async () => {
    await sourceCommand(() => sourcing.updateSources());
    await sourceCommand(() => sourcing.expectTrackAdditions(true));
    expect(proposal.current.tracking['file:Additions/Safe Two.md']).toMatchObject({ origin: 'explicit', track: false });
    await sourceCommand(() => sourcing.select('Safe One'));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => sourcing.select('Safe Two'));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
    await sourceCommand(() => checkpoint('refresh preserves explicit untracking instead of restoring the automatic choice'));
  });

  await test.step(sections.steps.acceptancePersistsOverrideMakesItAvailableFor, async () => {
    await sourceCommand(() => sourcing.accept());
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes as { bundleNodeName: string }[];
    expect(nodes.some(node => node.bundleNodeName === 'Safe One')).toBe(true);
    expect(nodes.some(node => node.bundleNodeName === 'Safe Two')).toBe(false);
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Safe Two'));
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Safe One'));
    await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
    await sourceCommand(() => checkpoint('accepted curation preserves the explicit untrack and the other automatic inclusion'));
  });

  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
