/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { scenarioSections, sourceSensitivityChange, trackedNodeBecomesSensitive, changesSinceTracking, conceptText, conceptLink,
  linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration,
  bundleGeneration, sourceReviewWorkspace, scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Changes since tracking can be reviewed for files folders and collections`);
const description = linkedScenarioDescription(conceptText`Review three node kinds without propagating sensitivity to children or collection members. ${conceptLink(trackedNodeBecomesSensitive.id, 'Tracked Bundle Node Becomes Sensitive')} keeps existing inclusion visible while the user reviews its cause.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: tracked nodes use the accepted source capture.` },
  applySensitivityPolicyWithoutRefreshingCapturedSources: { type: 'test', text: conceptText`Apply sensitivity policy without refreshing the captured sources.` },
  reviewOnlyIndividuallyMatchedNodesRequiredNodes: { type: 'test', text: conceptText`Review only the individually matched nodes; required nodes cannot be untracked.` },
  generateSuccessfullyAfterReviewVerifyWarningStays: { type: 'test', text: conceptText`Generate successfully after review and verify its warning stays resolved.` },
});
const areas = scenarioAreas([bundleCuration, bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '22e7b817-c370-48b4-a463-8dee8ffeaa24' }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
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
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Review existing inclusion', field: 'title', matchType: 'regex', value: '^(Incoming|Same|Notebook and research folder)$', markSensitive: true, scope: 'global' }));
    await sourceCommand(() => review.expectSensitivityReviewReady());
    await sourceCommand(() => expect(review.sensitivityReview).toContainText('Global filter “Review existing inclusion”'));
    expect(proposal.current.candidateSnapshotId).toBe(accepted);
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, changesSinceTracking));
    await sourceCommand(() => checkpoint('the named global policy explains the sensitivity change'));
  });

  await test.step(sections.steps.reviewOnlyIndividuallyMatchedNodesRequiredNodes, async () => {
    const pending = Object.values(proposal.current.tracking).filter(decision => decision.needsConfirmation);
    expect(pending).toHaveLength(3);
    await sourceCommand(() => expect(review.sensitivityReview).toContainText('was added and marks this node sensitive.'));
    await sourceCommand(() => filters.expectSourceChangeCount('Sensitivity changed', 3));
    await sourceCommand(() => addKeyFrame(sourceSensitivityChange));
    await sourceCommand(() => expect(review.sensitivityReviewNodes).toHaveCount(3));
    const home = review.sensitiveTrackingNode('Notebook and research folder');
    await sourceCommand(() => expect(home.getByRole('button', { name: /^(Untrack for now|Blacklist)$/ })).toHaveCount(0));
    await sourceCommand(() => expect(review.sensitiveTrackingNode('Same').getByRole('button', { name: /^(Untrack for now|Blacklist)$/ })).toHaveCount(0));
    await sourceCommand(() => expect(review.sensitiveTrackingNode('Incoming.md').getByRole('button', { name: /^(Keep tracked|Blacklist|Untrack for now)$/ })).toHaveCount(3));
    for (const name of ['Incoming.md', 'Same', 'Notebook and research folder']) {
      await sourceCommand(() => review.resolveSensitiveTracking(name, true));
    }
    await sourceCommand(() => expect(review.sensitivityReview).toContainText('All tracking choices reviewed.'));
    await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => review.accept());
    const records = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/tracking.json'), 'utf8'));
    for (const id of ['7a8209a73627', '7f2774a460ae', '105e8360dd61']) expect(records[id].sensitivity).toMatchObject({ effectivelySensitive: true, reviewedAt: expect.any(String) });
    expect(records['3265a081dc61'].sensitivity.effectivelySensitive).toBe(false);
    await sourceCommand(() => checkpoint('all three node kinds have reviewed inclusion without inherited sensitivity'));
  });

  await test.step(sections.steps.generateSuccessfullyAfterReviewVerifyWarningStays, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => preview.waitForPreviewComplete());
    await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toHaveCount(0));
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
    await sourceCommand(() => checkpoint('preview preserves the deliberately retained nodes without a sensitivity warning'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
