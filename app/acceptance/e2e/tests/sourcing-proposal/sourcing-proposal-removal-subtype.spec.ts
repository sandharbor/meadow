/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceBlacklistedRemoval, sourceUnreachableRemoval, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });
const name = linkedScenarioName(conceptText`Removal subtypes distinguish a staged blacklist from an unreachable route`);
const description = linkedScenarioDescription(conceptText`A removed incoming link leaves the leaf Not reachable. Explicitly blacklisting the departing page changes its direct removal subtype to Blacklisted. Removing the staged blacklist restores the route explanation before accepting the proposal.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted bundle before removing its leaf link.` },
  unreachable: { type: 'test', text: conceptText`Review the departure caused by the missing route.` },
  blacklist: { type: 'test', text: conceptText`Stage an explicit blacklist and inspect its distinct removal subtype.` },
  reverse: { type: 'test', text: conceptText`Remove the staged blacklist and restore the original departure explanation.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '7ae13448-8745-4e95-bf5b-c4eb98fa5e34' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, filters } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect), editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect), filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('accepted curation includes the tracked leaf'));
    return { editor, sourcing, filters };
  });
  await test.step(sections.steps.unreachable, async () => {
    await sourceCommand(() => sourceChanges.apply('remove-leaf-link', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => filters.expandFilterGroup('Remove'));
    await sourceCommand(() => sourcing.select('Leaf'));
    await sourceCommand(() => sourcing.expectSelectedRemovalReason('Not reachable'));
    await sourceCommand(() => filters.expectSourceChangeCount('Not reachable', 1));
    await sourceCommand(() => addKeyFrame(sourceUnreachableRemoval));
    await sourceCommand(() => checkpoint('the missing incoming route explains the departure'));
  });
  await test.step(sections.steps.blacklist, async () => {
    await sourceCommand(() => sourcing.setSelectedBlacklisted(true));
    await sourceCommand(() => sourcing.expectSelectedRemovalReason('Blacklisted'));
    await sourceCommand(() => filters.expectSourceChangeCount('Blacklisted', 1));
    await sourceCommand(() => filters.expectSourceChangeCount('Not reachable', 0));
    await sourceCommand(() => addKeyFrame(sourceBlacklistedRemoval));
    await sourceCommand(() => checkpoint('explicit exclusion has its own Blacklisted removal subtype'));
  });
  await test.step(sections.steps.reverse, async () => {
    await sourceCommand(() => sourcing.setSelectedBlacklisted(false));
    await sourceCommand(() => sourcing.expectSelectedRemovalReason('Not reachable'));
    await sourceCommand(() => filters.expectSourceChangeCount('Blacklisted', 0));
    await sourceCommand(() => checkpoint('reversing the blacklist restores the route-based removal explanation'));
    await sourceCommand(() => sourcing.accept());
  });
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
