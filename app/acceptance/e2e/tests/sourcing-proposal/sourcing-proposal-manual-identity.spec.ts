/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewIdentity, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });
const name = linkedScenarioName(conceptText`Manually pair a rewritten page without a suggested identity match`);
const description = linkedScenarioDescription(conceptText`Page identity remains available without suggested matches. It explains unmatched pages, stages a manual correspondence, and preserves the old tracking and identity when accepted.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted bundle before moving and rewriting its tracked leaf.` },
  inspect: { type: 'test', text: conceptText`Open Page identity with no suggestions and inspect the unmatched-page explanations.` },
  pair: { type: 'test', text: conceptText`Stage a manual pair, save it, and revisit the recorded decision.` },
  accept: { type: 'test', text: conceptText`Accept the proposal and verify that the rewritten page retains its old identity and tracking.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b6890333-6e25-46ac-88df-8c35d6a0aef5' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, proposal } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect), editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect), proposal = new SourcingProposalState(testServer, 'sourcing-review');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the tracked leaf has its accepted identity'));
    return { editor, sourcing, proposal };
  });
  await test.step(sections.steps.inspect, async () => {
    await sourceCommand(() => sourceChanges.apply('rewrite-and-move-leaf', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.expectPageIdentityAvailable());
    await sourceCommand(() => sourcing.openIdentities());
    await sourceCommand(() => sourcing.expectUnmatchedIdentityExplanation());
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('unmatched pages explain why no identity was suggested'));
  });
  await test.step(sections.steps.pair, async () => {
    await sourceCommand(() => sourcing.pairManually('100000000007', 'Revised Leaf.md'));
    expect(proposal.current.identities['100000000007']).toBeUndefined();
    await sourceCommand(() => sourcing.updateIdentities());
    expect(proposal.current.identities['100000000007']).toBe('Revised Leaf.md');
    await sourceCommand(() => sourcing.openIdentities());
    await sourceCommand(() => sourcing.expectIdentityDecision('100000000007', 'Same file'));
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('the manual identity is recorded and revisitable'));
    await sourceCommand(() => sourcing.identityButton('Cancel').click());
  });
  await test.step(sections.steps.accept, async () => {
    await sourceCommand(() => sourcing.accept());
    const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml'), 'utf8')) as { nodes: Array<{ bundleNodeId: string; bundleNodeName: string; listType: string }> };
    expect(config.nodes.find(node => node.bundleNodeId === '100000000007')).toMatchObject({ bundleNodeName: 'Revised Leaf', listType: 'whitelist' });
    await sourceCommand(() => checkpoint('acceptance preserves the old identity on the rewritten page'));
  });
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Revised Leaf.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md'] }));
});
