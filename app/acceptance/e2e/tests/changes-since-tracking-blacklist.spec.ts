/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/MeadowHomeBundleConfig.js';
import { Fixture } from '../src/run/workflows.js';
import { scenarioSections, trackedNodeBecomesSensitive, changesSinceTracking, blacklist, bridgeExclusion, conceptText, conceptLink,
  linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleSourcing,
  bundleGeneration, sourceReviewWorkspace, scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Changes since tracking can be resolved by blacklisting a sensitive bridge`);
const description = linkedScenarioDescription(conceptText`Choose ${conceptLink(blacklist.id, 'Blacklist')} for a tracked node that became sensitive. Review the ${conceptLink(bridgeExclusion.id, 'bridge exclusion')} and its dependent departures, preserve an independent route, and verify that discard restores the questions while acceptance excludes the material from preview.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the tracked bridge has dependent pages and an independent route.` },
  surfaceBridgeOneDependentAsNewlySensitive: { type: 'test', text: conceptText`Surface the bridge and one dependent as newly sensitive, with all three choices.` },
  stageBlacklistInspectConsequencesBeforeAcceptance: { type: 'test', text: conceptText`Stage the blacklist and inspect its consequences before acceptance.` },
  discardRestoresAcceptedInclusionSavedSensitivityPolicy: { type: 'test', text: conceptText`Discard restores the accepted inclusion; the saved sensitivity policy still prompts review.` },
  acceptDeliberateExclusionVerifyPreviewRemainsAvailable: { type: 'test', text: conceptText`Accept the deliberate exclusion and verify preview remains available without unresolved warnings.` },
});
const areas = scenarioAreas([bundleCuration, bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '738d7515-a266-4466-9a1c-46351067981b' }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, filters, review, proposal, nodes, saved } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const filters = new FilterPanelComponent(page, expect);
    const review = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'sourcing-review');
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    const filename = path.join(directory, 'config/bundle_node_config.yaml');
    const nodes = () => YAML.parse(fs.readFileSync(filename, 'utf8')).nodes as { bundleNodeName: string; listType: string }[];
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => editor.waitForSourceCheck());
    const saved = nodes();
    await sourceCommand(() => checkpoint('the tracked bridge has dependent pages and an independent route'));
    return { editor, filters, review, proposal, nodes, saved };
  });

  await test.step(sections.steps.surfaceBridgeOneDependentAsNewlySensitive, async () => {
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Private bridge', field: 'title', matchType: 'regex', value: '^(Bridge|Departing)$', markSensitive: true }));
    await sourceCommand(() => review.expectSensitivityReviewReady());
    await sourceCommand(() => expect(review.sensitiveTrackingNode('Bridge.md').getByRole('button', { name: /^(Keep tracked|Blacklist|Untrack for now)$/ })).toHaveCount(3));
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, changesSinceTracking));
    await sourceCommand(() => checkpoint('newly sensitive nodes offer inclusion deliberate exclusion and temporary untracking'));
  });

  await test.step(sections.steps.stageBlacklistInspectConsequencesBeforeAcceptance, async () => {
    await sourceCommand(() => review.blacklistSensitiveTracking('Bridge.md'));
    await sourceCommand(() => expect(review.sensitivityReview).toContainText('All tracking choices reviewed.'));
    expect(proposal.current.proposed.nodes.find(node => node.bundleNodeName === 'Bridge')?.listType).toBe('blacklist');
    expect(nodes()).toEqual(saved);
    await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    for (const title of ['Departing', 'Outside']) {
      await sourceCommand(() => review.select(title));
      await sourceCommand(() => expect(review.changeKind).toHaveText('Remove'));
    }
    await sourceCommand(() => review.select('Retained'));
    await sourceCommand(() => expect(review.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => expect(review.changeKind).toHaveCount(0));
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, blacklist));
    await sourceCommand(() => checkpoint('the staged blacklist exposes dependent departures while an independent route remains'));
  });

  await test.step(sections.steps.discardRestoresAcceptedInclusionSavedSensitivityPolicy, async () => {
    await sourceCommand(() => review.discard());
    expect(nodes()).toEqual(saved);
    await sourceCommand(() => page.reload());
    await sourceCommand(() => review.expectSensitivityReviewReady());
    await sourceCommand(() => expect(review.sensitivityReviewNodes).toHaveCount(2));
    await sourceCommand(() => checkpoint('discard restores both sensitivity questions without undoing the policy'));
  });

  await test.step(sections.steps.acceptDeliberateExclusionVerifyPreviewRemainsAvailable, async () => {
    await sourceCommand(() => review.blacklistSensitiveTracking('Bridge.md'));
    await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => review.accept());
    expect(nodes().find(node => node.bundleNodeName === 'Bridge')?.listType).toBe('blacklist');
    for (const title of ['Departing', 'Outside']) expect(nodes().some(node => node.bundleNodeName === title)).toBe(false);
    expect(nodes().find(node => node.bundleNodeName === 'Retained')?.listType).toBe('whitelist');
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'sourcing-review-data/Departing.md'))).toBe(true);
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => new PreviewPublishModal(page, expect).waitForPreviewComplete());
    await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toHaveCount(0));
    const generated = new MeadowHomeBundleConfig(testServer.configDir, 'sourcing-review', expect).generatedPreviewPages();
    for (const title of ['Bridge', 'Departing', 'Outside']) expect(generated.some(filename => filename === `${title}.html` || filename.endsWith(`/${title}.html`))).toBe(false);
    expect(generated.some(filename => filename === 'Retained.html' || filename.endsWith('/Retained.html'))).toBe(true);
    await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
    await sourceCommand(() => checkpoint('accepted blacklisting resolves sensitivity review and excludes dependent output'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
