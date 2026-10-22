/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourceReviewIdentity, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Source review requires identity decisions before seeing the graph`);

const description = linkedScenarioDescription(conceptText`${conceptLink(sourceReviewIdentity.id, 'Identity review')} blocks graph entry while any match remains unresolved. Resolve the identities to see the proposed comparison without accepting the source update.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: accepted identities are configured before the rename batch.` },
  blockGraphUntilDecided: { type: 'test', text: conceptText`Keep the graph unavailable while identity decisions remain unresolved.` },
  enterGraphAfterDeciding: { type: 'test', text: conceptText`Resolve every identity to enter the comparison graph without accepting the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity, sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '9fbb91cb-48e4-43dc-b5a2-72864118bd2d' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, directory, saved } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
    await sourceCommand(() => checkpoint('accepted identities are configured before the rename batch'));
    return { editor, sourcing, directory, saved };
  });

  await test.step(sections.steps.blockGraphUntilDecided, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => expect(sourcing.identities).toBeVisible());
    await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeDisabled());
    await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'List View', exact: true })).toHaveCount(0));
    await sourceCommand(() => sourcing.showIdentity('100000000006'));
    await sourceCommand(() => sourcing.expectPickRequired('100000000006'));
    await sourceCommand(() => sourcing.chooseIdentity('100000000002', 'Routes/Branch/Gateway.md'));
    await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeDisabled());
    await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'List View', exact: true })).toHaveCount(0));
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('the identity modal is open with one decision made and the others unresolved'));
  });

  await test.step(sections.steps.enterGraphAfterDeciding, async () => {
    await sourceCommand(() => sourcing.chooseIdentity('100000000003', 'Routes/Independent.md'));
    await sourceCommand(() => sourcing.chooseIdentity('100000000007', null));
    await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeDisabled());
    await sourceCommand(() => sourcing.chooseIdentity('100000000006', 'Retained One.md'));
    await sourceCommand(() => expect(sourcing.identityButton('Confirm')).toBeEnabled());
    await sourceCommand(() => sourcing.continueToGraph());
    await sourceCommand(() => expect(sourcing.identities).toBeHidden());
    await sourceCommand(() => sourcing.select('Gateway'));
    await sourceCommand(() => sourcing.expectSelectedRename('Routes/Branch/Bridge.md', 'Routes/Branch/Gateway.md'));
    await sourceCommand(() => sourcing.expectNodeVisible('Bridge', false));
    await sourceCommand(() => sourcing.expectNodeVisible('Leaf'));
    await sourceCommand(() => sourcing.expectNodeVisible('Petal'));
    await sourceCommand(() => sourcing.select('Leaf'));
    await sourceCommand(() => sourcing.expectSelectedRemovalReason('Source missing'));
    await sourceCommand(() => sourcing.select('Petal'));
    await sourceCommand(() => expect(sourcing.changeKind).toHaveText('Add'));
    expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
    await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
    await sourceCommand(() => checkpoint('resolved identities are visible in the comparison without accepting the sources'));
  });

  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [proposal.relativePath, `bundles/sourcing-review/raw/sourcing/snapshots/${proposal.current.candidateSnapshotId}/`, 'source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'],
    allowedModified: ['bundles/sourcing-review/raw/sourcing/state.json', 'source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'],
  }));
});
