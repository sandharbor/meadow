/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';

import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, Pill, SelectedPageDetailComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { MeadowHomeBundleConfig } from '../../src/run/utils/index.js';
import { scenarioSections, exemplarySpec, sourceSnapshot, pendingSourceProposal, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewAcceptance, tracking, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

const name = linkedScenarioName(conceptText`Confirming a depth change captures the updated link and destination together without losing an untrack decision`);

const description = linkedScenarioDescription(conceptText`Change an outgoing link at the traversal boundary and revise the newly linked page's text. Increasing depth requires confirmation of ${conceptLink(sourceChangesDuringReview.id, 'Source Changes During Review')}. The rebuilt ${conceptLink(pendingSourceProposal.id, 'Pending Source Proposal')} captures the updated link and destination together. ${conceptLink(pendingProposalRevalidation.id, 'Pending Proposal Revalidation')} preserves an earlier untrack decision, while accepted configuration stays unchanged until ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')}.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a ${conceptLink(sourceSnapshot.id, 'Source Snapshot')} with traversal stopped at a page. Stage an explicit ${conceptLink(tracking.id, 'Bundle Node Tracking')} decision to leave another page untracked.` },
  consentRequiredBeforeDepthEditCanCapture: { type: 'test', text: conceptText`Change the stopped page's outgoing link and the new destination's text, then increase depth. ${conceptLink(sourceChangesDuringReview.id, 'Source Changes During Review')} requires confirmation before rebuilding the capture.` },
  captureNewLinksDestinationTogetherRetainingApplicable: { type: 'test', text: conceptText`Confirm the refresh. The ${conceptLink(pendingSourceProposal.id, 'Pending Source Proposal')} contains the revised link and destination together, and ${conceptLink(pendingProposalRevalidation.id, 'Pending Proposal Revalidation')} preserves the explicit untrack decision.` },
  acceptInstallsCoherentScopeUntrackChoiceTogether: { type: 'test', text: conceptText`Use ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} to install the confirmed depth change and preserve the untrack decision in curation.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '51af7817-6b84-4f0e-b058-b20b13fe27c4' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  const { editor, sourcing, proposal, bundleConfig, before, acceptedConfig } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'example-bundle');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('example-bundle'));
    await sourceCommand(() => editor.waitForLoad('example-bundle'));
    await sourceCommand(() => sourcing.openByLink('example-bundle'));
    await sourceCommand(() => sourcing.select('Inversion'));
    await sourceCommand(() => sourcing.untrackSelected());
    await sourceCommand(() => sourcing.select('Cognitive Biases'));

    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'example-bundle', expect);
    expect(bundleConfig.requireNode({ bundleNodeName: 'Cognitive Biases' }).outlinksDepth).toBe(0);
    const before = proposal.current;
    expect(before.tracking['file:Inversion.md']).toMatchObject({ track: false, origin: 'explicit' });
    const acceptedConfig = new MeadowHomeBundleConfig(testServer.configDir, "example-bundle", expect).readNodesText();
    await sourceCommand(() => checkpoint(conceptText`The captured traversal stops at the selected page, and the ${conceptLink(pendingSourceProposal.id, 'Pending Source Proposal')} holds an explicit untrack decision for another page.`));
    return { editor, sourcing, proposal, bundleConfig, before, acceptedConfig };
  });

  const { confirmation } = await test.step(sections.steps.consentRequiredBeforeDepthEditCanCapture, async () => {
    await sourceCommand(() => sourceChanges.apply('redirect-biases-link', 'example-bundle-data'));
    const endConsentErrors = expectLogErrors(/This boundary change needs newer source material|server responded with a status of 409/);
    await sourceCommand(() => sourcing.setSelectedOutlinkDepth(1));
    const confirmation = page.getByRole('dialog', { name: 'Update sources for this change?', exact: true });
    await sourceCommand(() => expect(confirmation).toBeVisible());
    endConsentErrors();
    expect(proposal.current.candidateSnapshotId).toBe(before.candidateSnapshotId);
    expect(proposal.current.proposed.nodes.find(node => node.bundleNodeName === 'Cognitive Biases')?.outlinksDepth).toBe(0);
    expect(new MeadowHomeBundleConfig(testServer.configDir, "example-bundle", expect).readNodesText()).toBe(acceptedConfig);
    await sourceCommand(() => addKeyFrame(sourceChangesDuringReview));
    await sourceCommand(() => checkpoint(conceptText`Confirmation of ${conceptLink(sourceChangesDuringReview.id, 'Source Changes During Review')} is open. The reviewed capture, proposed depth, and accepted configuration are unchanged.`));
    return { confirmation };
  });

  await test.step(sections.steps.captureNewLinksDestinationTogetherRetainingApplicable, async () => {
    await sourceCommand(() => confirmation.getByRole('button', { name: 'Update sources and apply change', exact: true }).click());
    await sourceCommand(() => expect(confirmation).toBeHidden());
    expect(proposal.current.candidateSnapshotId).not.toBe(before.candidateSnapshotId);
    expect(proposal.current.proposed.nodes.find(node => node.bundleNodeName === 'Cognitive Biases')?.outlinksDepth).toBe(1);
    expect(proposal.current.tracking['file:Inversion.md']).toMatchObject({ track: false, origin: 'explicit' });
    expect(new MeadowHomeBundleConfig(testServer.configDir, "example-bundle", expect).readNodesText()).toBe(acceptedConfig);
    await sourceCommand(() => sourcing.compare('Confirmation Bias'));
    await sourceCommand(() => expect(sourcing.comparison).toContainText('This newly reviewed destination describes the tendency'));
    await sourceCommand(() => sourcing.closeComparison());
    await sourceCommand(() => sourcing.expectNodeVisible('Availability Bias', false));
    await sourceCommand(() => sourcing.compare('Cognitive Biases'));
    await sourceCommand(() => sourcing.expectAddedContent('**[[Confirmation Bias]]**'));
    await sourceCommand(() => checkpoint(conceptText`The rebuilt ${conceptLink(pendingSourceProposal.id, 'Pending Source Proposal')} contains the revised link, new destination text, and increased depth together. The explicit untrack decision survives and accepted configuration is unchanged.`));
  });

  await test.step(sections.steps.acceptInstallsCoherentScopeUntrackChoiceTogether, async () => {
    await sourceCommand(() => sourcing.closeComparison());
    await sourceCommand(() => sourcing.accept());
    expect(new MeadowHomeBundleConfig(testServer.configDir, "example-bundle", expect).readNodesText()).not.toBe(acceptedConfig);
    expect(bundleConfig.requireNode({ bundleNodeName: 'Cognitive Biases' }).outlinksDepth).toBe(1);
    expect(bundleConfig.findNode({ bundleNodeName: 'Inversion' })).toBeUndefined();
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('Inversion'));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
    await sourceCommand(() => checkpoint(conceptText`${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} installs the increased depth, and the page explicitly left untracked remains available as Not Tracked in curation.`));
  });

  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/Confirmation Bias.md'] }));
});
