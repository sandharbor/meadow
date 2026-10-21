/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { scenarioSections, trackedNodeBecomesSensitive, changesSinceTracking, filterSensitivity, conceptText, conceptLink,
  linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration,
  bundleGeneration, sourceReviewWorkspace, scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Changes since tracking disappear when the sensitivity cause is disabled`);
const description = linkedScenarioDescription(conceptText`Disable the only policy cause while reviewing the required collection, leaving an empty review. ${conceptLink(trackedNodeBecomesSensitive.id, 'Tracked Bundle Node Becomes Sensitive')} keeps existing inclusion visible while the user reviews its cause.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: tracked nodes use the accepted source capture.` },
  applySensitivityPolicyWithoutRefreshingCapturedSources: { type: 'test', text: conceptText`Apply sensitivity policy without refreshing the captured sources.` },
  collectionRemainsNodeLocalRequiredMembersHave: { type: 'test', text: conceptText`A collection remains node-local; its required members have no sensitivity decisions.` },
  doneExitsWithoutAcceptingFictitiousSourceOr: { type: 'test', text: conceptText`Done exits without accepting a fictitious source or tracking change.` },
});
const areas = scenarioAreas([bundleCuration, bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c0073d98-4247-43c3-b6c1-fc77b0831ed9' }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, filters, review, preview, proposal, directory, accepted } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const filters = new FilterPanelComponent(page, expect);
    const review = new SourcingWorkspacePage(page, expect);
    const preview = new PreviewPublishModal(page, expect);
    const proposal = new SourcingProposalState(testServer, 'multi-source-mixed');
    const directory = path.join(testServer.configDir, 'bundles/multi-source-mixed');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('multi-source-mixed'));
    await sourceCommand(() => editor.waitForLoad('multi-source-mixed'));
    await sourceCommand(() => editor.waitForSourceCheck());
    const accepted = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId;
    await sourceCommand(() => checkpoint('tracked nodes use the accepted source capture'));
    return { editor, filters, review, preview, proposal, directory, accepted };
  });

  await test.step(sections.steps.applySensitivityPolicyWithoutRefreshingCapturedSources, async () => {
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Review existing inclusion', field: 'title', matchType: 'regex', value: '^Notebook and research folder$', markSensitive: true, scope: 'global' }));
    await sourceCommand(() => review.expectSensitivityReviewReady());
    await sourceCommand(() => expect(review.sensitivityReview).toContainText('Global filter “Review existing inclusion”'));
    expect(proposal.current.candidateSnapshotId).toBe(accepted);
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, changesSinceTracking));
    await sourceCommand(() => checkpoint('the named global policy explains the sensitivity change'));
  });

  await test.step(sections.steps.collectionRemainsNodeLocalRequiredMembersHave, async () => {
    expect(Object.keys(proposal.current.tracking)).toHaveLength(1);
    await sourceCommand(() => expect(review.sensitivityReview.getByRole('button', { name: /^(Untrack for now|Blacklist)$/ })).toHaveCount(0));
    await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => filters.disableFilter('Review existing inclusion'));
    await sourceCommand(() => expect(review.acceptedChanges).toContainText('No changes to review'));
    await sourceCommand(() => expect(review.root.getByRole('button', { name: 'Done', exact: true })).toBeEnabled());
    expect(Object.keys(proposal.current.tracking)).toHaveLength(0);
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, filterSensitivity));
    await sourceCommand(() => checkpoint('disabling the sole cause leaves an empty review with Done'));
  });

  await test.step(sections.steps.doneExitsWithoutAcceptingFictitiousSourceOr, async () => {
    await sourceCommand(() => review.root.getByRole('button', { name: 'Done', exact: true }).click());
    await sourceCommand(() => expect(review.root).toBeHidden());
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => preview.waitForPreviewComplete());
    await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toHaveCount(0));
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId).toBe(accepted);
    await sourceCommand(() => checkpoint('Done returns to curation and preview without a sensitivity warning'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
