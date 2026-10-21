/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewIdentity, sourceChangesDuringReview, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`A refresh asks only about newly renamed files and keeps earlier identity decisions`);

const description = linkedScenarioDescription(conceptText`Decide every identity in a rename review, then refresh after another page is renamed and
extended. Identity review is required again, but only the new file needs a choice; the earlier decisions are listed as
already decided with their choices intact, and stay in place when one of them is changed.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: every identity in the first rename review is decided.` },
  prepareScenarioVerifyStartingState: { type: 'test', text: conceptText`Prepare the scenario and verify its starting state.` },
  onlyNewFileAsksForChoice: { type: 'test', text: conceptText`Only the new file asks for a choice.` },
  earlierDecisionsAreListedAsAlreadyDecided: { type: 'test', text: conceptText`Earlier decisions are listed as already decided, with their choices intact.` },
  earlierDecisionCanStillChangeItStays: { type: 'test', text: conceptText`An earlier decision can still change, and it stays with the decided files.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '3f58ea0a-6f02-4de3-869d-2965c0b497d2' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { sourcing, proposal, directory, earlier } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'sourcing-review');
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.decideIdentity('100000000002', 'Routes/Branch/Gateway.md'));
    await sourceCommand(() => sourcing.decideIdentity('100000000003', null));
    await sourceCommand(() => sourcing.decideIdentity('100000000006', 'Retained One.md'));
    await sourceCommand(() => sourcing.confirmIdentities());
    const earlier = { ...proposal.current.identities };
    expect(Object.keys(earlier).sort()).toEqual(['100000000002', '100000000003', '100000000006', '100000000007']);
    await sourceCommand(() => checkpoint('every identity in the first rename review is decided'));
    return { sourcing, proposal, directory, earlier };
  });

  await test.step(sections.steps.prepareScenarioVerifyStartingState, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-outside-with-edits', 'sourcing-review-data'));
    await sourceCommand(() => sourcing.refreshIdentitySources());
    await sourceCommand(() => expect(sourcing.identities).toBeVisible());
    await sourceCommand(() => expect(sourcing.identityBackdrop).toBeVisible());
  });

  await test.step(sections.steps.onlyNewFileAsksForChoice, async () => {
    await sourceCommand(() => expect(sourcing.identitySection('Choose a match').getByTestId(/^source-move-/)).toHaveCount(1));
    await sourceCommand(() => expect(sourcing.identitySection('Choose a match').getByTestId('source-move-100000000005')).toBeVisible());
    await sourceCommand(() => expect(sourcing.identitySection('Likely renamed')).toHaveCount(0));
    await sourceCommand(() => expect(sourcing.identities.getByText('Choose a match for 1 more file.', { exact: true })).toBeVisible());
  });

  const { decided } = await test.step(sections.steps.earlierDecisionsAreListedAsAlreadyDecided, async () => {
    const decided = sourcing.identitySection('Already decided');
    await sourceCommand(() => expect(decided.getByTestId(/^source-move-/)).toHaveCount(4));
    await sourceCommand(() => sourcing.expectIdentityDecision('100000000002', 'Same file'));
    await sourceCommand(() => sourcing.expectIdentityDecision('100000000003', 'New file'));
    await sourceCommand(() => sourcing.expectIdentityDecision('100000000007', 'Same file'));
    await sourceCommand(() => sourcing.expectIdentityMatch('100000000006', 'Retained One.md'));
    expect(proposal.current.identities).toEqual(earlier);
    await sourceCommand(() => addKeyFrame(sourceChangesDuringReview));
    await sourceCommand(() => checkpoint('after a refresh only the new file needs a choice and earlier decisions stay decided'));
    return { decided };
  });

  await test.step(sections.steps.earlierDecisionCanStillChangeItStays, async () => {
    await sourceCommand(() => sourcing.decideIdentity('100000000007', null));
    await sourceCommand(() => expect(decided.getByTestId('source-move-100000000007')).toBeVisible());
    await sourceCommand(() => sourcing.decideIdentity('100000000005', 'Beyond.md'));
    await sourceCommand(() => sourcing.confirmIdentities());
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('the new decision and the changed earlier one are both kept'));

    await sourceCommand(() => sourcing.accept());
    const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes as Array<{ bundleNodeId: string; bundleNodeName: string }>;
    expect(nodes.find(node => node.bundleNodeId === '100000000005')?.bundleNodeName).toBe('Beyond');
    expect(nodes.find(node => node.bundleNodeId === '100000000002')?.bundleNodeName).toBe('Gateway');
    expect(nodes.some(node => node.bundleNodeId === '100000000003')).toBe(false);
    expect(nodes.some(node => node.bundleNodeId === '100000000007')).toBe(false);
    await sourceCommand(() => checkpoint('acceptance applies earlier and later identity decisions together'));
  });

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Beyond.md', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'],
    allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Departing.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Outside.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'],
  }));
});
