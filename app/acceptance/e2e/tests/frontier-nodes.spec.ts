/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage, BundleEditorPage, FilterPanelComponent, SelectedPageDetailComponent, Pill, ActionButton } from "../src/run/pages/index.js";
import { scenarioSections, sourcingReviewRedesign, frontier, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`frontier nodes show filtered pages and respond to depth changes`);

const description = linkedScenarioDescription(conceptText`Inspect pages beyond the traversal boundary and change the traversal depth. The frontier
should update as pages enter or leave the working graph.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle list loaded.` },
  openBigBundle: { type: 'test', text: conceptText`Open the big bundle.` },
  enableFrontierPages: { type: 'test', text: conceptText`Enable frontier pages.` },
  soloFrontier: { type: 'test', text: conceptText`Solo the frontier.` },
  inspectNearbyFrontierPages: { type: 'test', text: conceptText`Inspect the nearby frontier pages.` },
  extendFrontierDepthIncreaseFrontierDepthVerify: { type: 'test', text: conceptText`Extend the frontier depth. Increase frontier depth to 2 and verify 10 bundle pages` },
  inspectDistantFrontierPage: { type: 'test', text: conceptText`Inspect a distant frontier page.` },
  getSelectedPageDetailCardSidebar: { type: 'test', text: conceptText`Get the selected page detail card from the sidebar` },
  frontierPagesShouldNotBeTrackableOr: { type: 'test', text: conceptText`Frontier pages should not be trackable or blacklistable` },
  shouldShowFrontierPillButNotTracked: { type: 'test', text: conceptText`Should show "Frontier" pill but not "Tracked" pill` },
  explainCopyFrontierPage: { type: 'test', text: conceptText`Explain and copy the frontier page.` },
  returnFullGraph: { type: 'test', text: conceptText`Return to the full graph.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '360daa04-8a00-4999-96b2-4e655a7fba25' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, assertMeadowHomeState, addKeyFrame }) => {
  const { bundleList } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => checkpoint("bundle list loaded"));
    return { bundleList };
  });

  const { editor } = await test.step(sections.steps.openBigBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle("meadow-test-bundle-big"));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForLoad("meadow-test-bundle-big"));
    await sourceCommand(() => checkpoint("bundle editor loaded"));

    await sourceCommand(() => editor.sourceReview.open());
    return { editor };
  });

  const { filterPanel } = await test.step(sections.steps.enableFrontierPages, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.enableFilter("Frontier"));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("frontier pages shown"));
    return { filterPanel };
  });

  await test.step(sections.steps.soloFrontier, async () => {
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Frontier"));
    await sourceCommand(() => addKeyFrame(frontier));
    await sourceCommand(() => checkpoint("frontier filter soloed"));
  });

  await test.step(sections.steps.inspectNearbyFrontierPages, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(7));
    await sourceCommand(() => checkpoint("list view with 7 frontier pages at depth 1"));
  });

  await test.step(sections.steps.extendFrontierDepthIncreaseFrontierDepthVerify, async () => {
    await sourceCommand(() => filterPanel.setFilterThresholdValue("Frontier", 2));
    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(10));
    await sourceCommand(() => checkpoint("list view with 10 frontier pages at depth 2"));
  });

  await test.step(sections.steps.inspectDistantFrontierPage, async () => {
    await sourceCommand(() => editor.clickListViewRow(9));
    await sourceCommand(() => page.waitForTimeout(250));
  });

  const { detail } = await test.step(sections.steps.getSelectedPageDetailCardSidebar, async () => {
    const selectedPageRoot = editor.getSelectedPageRoot();
    const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
    await sourceCommand(() => detail.openDetails());
    await sourceCommand(() => page.waitForTimeout(250));
    return { detail };
  });

  await test.step(sections.steps.frontierPagesShouldNotBeTrackableOr, async () => {
    await sourceCommand(() => detail.expectButtonDisabled(ActionButton.Track));
    await sourceCommand(() => detail.expectButtonDisabled(ActionButton.Blacklist));
  });

  await test.step(sections.steps.shouldShowFrontierPillButNotTracked, async () => {
    await sourceCommand(() => detail.expectPill(Pill.Frontier));
    await sourceCommand(() => detail.expectNoPill(Pill.Tracked));
    await sourceCommand(() => checkpoint("frontier page details with disabled track and blacklist"));
  });

  await test.step(sections.steps.explainCopyFrontierPage, async () => {
    await sourceCommand(() => detail.openAndCloseTraversalPath());
    await sourceCommand(() => editor.openAndCloseCopySelectedPages(".md"));
    await sourceCommand(() => checkpoint("the frontier page's traversal path and copy dialogs open and close"));
  });

  await test.step(sections.steps.returnFullGraph, async () => {
    await sourceCommand(() => editor.switchToGraphView());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Frontier"));
    await sourceCommand(() => checkpoint("frontier depth 2 with all nodes showing"));

    void bigBundle;

    await sourceCommand(() => editor.sourceReview.discard());
    await sourceCommand(() => checkpoint("frontier exploration leaves accepted material unchanged"));
  });

  await sourceCommand(() => assertMeadowHomeState());
});
