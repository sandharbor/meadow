/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { scenarioSections, pendingSourceProposal, sourceReviewTrigger, sourceReviewWorkspace, overrides, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleSourcing } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

const name = linkedScenarioName(conceptText`Sourcing depth edits preview the proposal while accepted curation stays stable`);

const description = linkedScenarioDescription(conceptText`Increase a page's traversal depth from curation and enter sourcing. Inspect newly admitted nodes
immediately, the staged depth in the header summary, and the unchanged accepted settings. Choose
Later, reload, and verify accepted curation still uses the old scope and reopening restores the
proposed depth. Required checkpoints: accepted baseline; expanded candidate; reopened deferred
proposal.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: accepted scope excludes the pages behind the Cognitive Biases stop.` },
  expandStopInspectCapturedProposalWithoutChanging: { type: 'test', text: conceptText`Expand the stop and inspect the captured proposal without changing accepted settings.` },
  laterReloadRetainOriginalCurationGraphDurable: { type: 'test', text: conceptText`Later and reload retain the original curation graph and the durable proposal.` },
  discardLeavesAcceptedFixtureExactlyAsIt: { type: 'test', text: conceptText`Discard leaves the accepted fixture exactly as it was.` },
});
const areas = scenarioAreas([bundleCuration, bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '75df4c30-b7f7-4342-9330-77af9f6eca5d' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const { editor, detail, configPath, saved } = await test.step(sections.steps.setup, async () => {
    const list = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('example-bundle'));
    await sourceCommand(() => editor.waitForLoad('example-bundle'));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Availability Bias'));
    await sourceCommand(() => editor.clickListViewRowByExactName('Cognitive Biases'));
    const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
    await sourceCommand(() => detail.openDetails());
    const configPath = path.join(testServer.configDir, 'bundles/example-bundle/config/bundle_node_config.yaml');
    const saved = fs.readFileSync(configPath, 'utf8');
    await sourceCommand(() => checkpoint('accepted scope excludes the pages behind the Cognitive Biases stop'));
    return { editor, detail, configPath, saved };
  });

  const { sourcing, workspace } = await test.step(sections.steps.expandStopInspectCapturedProposalWithoutChanging, async () => {
    await sourceCommand(() => editor.getSelectedPageRoot().getByTitle('Edit outlink depth override', { exact: true }).click());
    await sourceCommand(() => detail.setOutlinksDepth(1));
    const sourcing = new SourcingWorkspacePage(page, expect);
    const workspace = sourcing.root;
    await sourceCommand(() => expect(workspace).toBeVisible());
    await sourceCommand(() => expect(workspace.getByRole('button', { name: 'Accept changes', exact: true })).toBeEnabled());
    await sourceCommand(() => workspace.getByRole('button', { name: 'List View', exact: true }).click());
    await sourceCommand(() => sourcing.expectNodeVisible('Availability Bias'));
    expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
    await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
    await sourceCommand(() => checkpoint('expanded candidate includes Availability Bias while accepted configuration stays unchanged'));
    return { sourcing, workspace };
  });

  await test.step(sections.steps.laterReloadRetainOriginalCurationGraphDurable, async () => {
    await sourceCommand(() => sourcing.later());
    await sourceCommand(() => page.reload());
    await sourceCommand(() => editor.waitForLoad('example-bundle'));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Availability Bias'));
    await sourceCommand(() => page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i }).click());
    await sourceCommand(() => expect(workspace).toBeVisible());
    await sourceCommand(() => workspace.getByRole('button', { name: 'List View', exact: true }).click());
    await sourceCommand(() => sourcing.expectNodeVisible('Availability Bias'));
    expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
    await sourceCommand(() => checkpoint('reopened deferred proposal retains the expanded capture and staged depth'));
  });

  await test.step(sections.steps.discardLeavesAcceptedFixtureExactlyAsIt, async () => {
    await sourceCommand(() => sourcing.discard());
    await sourceCommand(() => expect(workspace).toBeHidden());
    expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
    await sourceCommand(() => checkpoint('discard returned to the unchanged accepted scope'));
  });

  await sourceCommand(() => assertMeadowHomeState());
});
