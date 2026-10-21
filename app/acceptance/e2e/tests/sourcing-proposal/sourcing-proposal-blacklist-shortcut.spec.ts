/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, sourcingReviewRedesign, sourceReviewTrigger, blacklist, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Curation applies blacklist shortcuts only when calculated impact is limited to the selected item`);

const description = linkedScenarioDescription(conceptText`A leaf exclusion stays in curation with a conditional Undo. Hiding the other graph pages does not
make a bridge safe to exclude immediately: its wider impact still opens sourcing. A leaf exclusion
made inside sourcing stays in that proposal. Empty-folder shortcuts are covered with folder review.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: a leaf and a bridge have different effects on the complete graph.` },
  trueLeafReversibleImmediateCurationEdit: { type: 'test', text: conceptText`A true leaf is a reversible immediate curation edit.` },
  filteringGraphApparentLeafCannotConcealActual: { type: 'test', text: conceptText`Filtering the graph to an apparent leaf cannot conceal its actual departures.` },
  onceSourcingOpenEvenHarmlessLeafExclusion: { type: 'test', text: conceptText`Once sourcing is open, even a harmless leaf exclusion remains staged.` },
});
const areas = scenarioAreas([bundleCuration, bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '09fc160a-3e39-4bb1-8fe0-7b722c5c91ac' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, sourcing, proposal, configuration, original } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const sourcing = new SourcingWorkspacePage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'sourcing-review');
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => editor.switchToListView());
    const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
    const configuration = () => YAML.parse(fs.readFileSync(configPath, 'utf8'));
    const original = configuration();
    await sourceCommand(() => checkpoint('a leaf and a bridge have different effects on the complete graph'));
    return { editor, sourcing, proposal, configuration, original };
  });

  await test.step(sections.steps.trueLeafReversibleImmediateCurationEdit, async () => {
    await sourceCommand(() => editor.rightClickRow('Leaf'));
    await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
    const undo = page.getByRole('button', { name: 'Undo blacklist change', exact: true });
    await sourceCommand(() => expect(undo).toBeVisible());
    await sourceCommand(() => expect(sourcing.root).toBeHidden());
    expect(configuration().nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')?.listType).toBe('blacklist');
    await sourceCommand(() => addKeyFrame(blacklist));
    await sourceCommand(() => checkpoint('the leaf blacklist was applied with Undo and no wider scope changes'));

    await sourceCommand(() => undo.click());
    await sourceCommand(() => expect(undo).toBeHidden());
    expect(configuration()).toEqual(original);
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Leaf'));
    await sourceCommand(() => checkpoint('Undo restores the original accepted page settings'));
  });

  await test.step(sections.steps.filteringGraphApparentLeafCannotConcealActual, async () => {
    await sourceCommand(() => new FilterPanelComponent(page, expect).fillSearch('Bridge'));
    await sourceCommand(() => editor.rightClickRow('Bridge'));
    await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
    await sourceCommand(() => expect(sourcing.root).toBeVisible());
    expect(configuration()).toEqual(original);
    await sourceCommand(() => sourcing.select('Outside'));
    await sourceCommand(() => expect(sourcing.changeKind).toHaveText('Remove'));
    await sourceCommand(() => checkpoint('the hidden wider consequences require a sourcing proposal'));
  });

  await test.step(sections.steps.onceSourcingOpenEvenHarmlessLeafExclusion, async () => {
    await sourceCommand(() => sourcing.select('Leaf'));
    await sourceCommand(() => sourcing.setSelectedBlacklisted(true));
    expect(configuration()).toEqual(original);
    expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')?.listType).toBe('blacklist');
    await sourceCommand(() => checkpoint('the harmless leaf edit is staged with the wider pending exclusion'));

    await sourceCommand(() => sourcing.discard());
    await sourceCommand(() => expect(sourcing.root).toBeHidden());
    expect(configuration()).toEqual(original);
    await sourceCommand(() => checkpoint('discard preserves the accepted configuration after both staged exclusions'));
  });

  await sourceCommand(() => assertMeadowHomeState());
});
