/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewIdentity, pendingSourceProposal, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing review preserves partial review on Cancel`);

const description = linkedScenarioDescription(conceptText`Cancel a partially completed ${conceptLink(sourceReviewIdentity.id, 'identity review')} to return to accepted curation. Reload and reopen the ${conceptLink(pendingSourceProposal.id, 'pending proposal')} to find the saved choice under Already decided, with the other identities still unresolved.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a rename review and save one identity decision, leaving the others unresolved.` },
  cancelPartialReview: { type: 'test', text: conceptText`Cancel returns to accepted curation and preserves the partial proposal without applying it.` },
  restorePartialReview: { type: 'test', text: conceptText`Reload and reopen review to restore the saved choice and the remaining unresolved identities.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f98553cf-a072-43b5-9855-b1dea5bd8118' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, proposal, directory, saved, decisions } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'sourcing-review');
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
    await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.chooseIdentity('100000000002', 'Routes/Branch/Gateway.md'));
    const decisions = { ...proposal.current.identities };
    expect(decisions).toEqual({ '100000000002': 'Routes/Branch/Gateway.md' });
    await sourceCommand(() => checkpoint('one identity is decided and the rest of the review remains unfinished'));
    return { editor, sourcing, proposal, directory, saved, decisions };
  });

  await test.step(sections.steps.cancelPartialReview, async () => {
    await sourceCommand(() => sourcing.identityButton('Cancel').click());
    await sourceCommand(() => expect(sourcing.root).toBeHidden());
    expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
    expect(proposal.current.identities).toEqual(decisions);
    await sourceCommand(() => addKeyFrame(pendingSourceProposal));
    await sourceCommand(() => checkpoint('Cancel returns to curation with the partial proposal saved and accepted configuration unchanged'));
  });

  await test.step(sections.steps.restorePartialReview, async () => {
    await sourceCommand(() => page.reload());
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => expect(sourcing.identities).toBeVisible());
    await sourceCommand(() => expect(sourcing.identitySection('Already decided').getByTestId('source-move-100000000002')).toBeVisible());
    await sourceCommand(() => sourcing.expectIdentityDecision('100000000002', 'Same file'));
    expect(proposal.current.identities).toEqual(decisions);
    await sourceCommand(() => sourcing.showIdentity('100000000006'));
    await sourceCommand(() => sourcing.expectPickRequired('100000000006'));
    expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('reopening restores the saved identity choice while the other identities remain unresolved'));
  });

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [proposal.relativePath, `bundles/sourcing-review/raw/sourcing/snapshots/${proposal.current.candidateSnapshotId}/`, 'source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'],
    allowedModified: ['bundles/sourcing-review/raw/sourcing/state.json', 'source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'],
  }));
});
