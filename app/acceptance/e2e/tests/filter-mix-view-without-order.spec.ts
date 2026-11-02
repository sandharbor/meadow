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
import { FilterPanelComponent, BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, filterMixing, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Without terms can be reordered by dropping one directly onto the other`);

const description = linkedScenarioDescription(conceptText`Select all pages and use ${conceptLink(filterMixing.id, "Filter Mixing")} to subtract Untracked from Selection Solo, leaving a nonempty graph. Drop Selection Solo directly onto Untracked to reverse the terms. Untracked without Selection Solo then leaves the graph empty, demonstrating that term order changes the result.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a bundle in the editor to exercise ${conceptLink(filterMixing.id, "Filter Mixing")} with the selection and the built-in Untracked filter.` },
  buildSelectionWithoutUntrackedPages: { type: 'test', text: conceptText`Select all pages, solo the selection and Untracked, then use ${conceptLink(filterMixing.id, "Filter Mixing")}'s Without operator to subtract Untracked from Selection Solo. The graph still contains pages.` },
  reverseFilterOrder: { type: 'test', text: conceptText`In ${conceptLink(filterMixing.id, "Filter Mixing")}, drop Selection Solo directly onto Untracked. The terms now appear in the reverse order: Untracked first, Selection Solo second.` },
  checkReversedResult: { type: 'test', text: conceptText`Close the ${conceptLink(filterMixing.id, "Filter Mixing")} editor to inspect the reversed expression's result. Untracked without Selection Solo leaves no pages in the graph.` },
});
const areas = scenarioAreas([bundleCuration], { subAreas: [filterMixing] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '9a8a5d08-d311-4deb-81a8-c6b2a608761e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
}) => {
  const { editor, filterPanel } = await test.step(sections.steps.setup, async () => {
    const workflows = new Workflows(page, expect);
    await sourceCommand(() => workflows.navigateToBigBundle());

    const editor = new BundleEditorPage(page, expect);
    const filterPanel = new FilterPanelComponent(page, expect);

    await sourceCommand(() => checkpoint("The bundle is open before selecting pages or combining filters."));
    return { editor, filterPanel };
  });

  await test.step(sections.steps.buildSelectionWithoutUntrackedPages, async () => {
    await sourceCommand(() => editor.clickSelectAll());
    await sourceCommand(() => editor.clickSoloSelection());
    await sourceCommand(() => filterPanel.enableAndSoloFilter("Untracked"));

    await sourceCommand(() => filterPanel.openMixFilters());
    await sourceCommand(() => filterPanel.expectMixTermOrder(["Selection Solo", "Untracked"]));
    await sourceCommand(() => filterPanel.chooseMixOperator("Without"));
    await sourceCommand(() => filterPanel.closeMixFilters());
    await sourceCommand(() => editor.expectGraphViewHasPages());
    await sourceCommand(() => checkpoint("Selection Solo without Untracked leaves a nonempty graph."));
  });

  await test.step(sections.steps.reverseFilterOrder, async () => {
    await sourceCommand(() => filterPanel.openMixFilters());
    await sourceCommand(() => filterPanel.dragMixTermOnto("Selection Solo", "Untracked"));
    await sourceCommand(() => filterPanel.expectMixTermOrder(["Untracked", "Selection Solo"]));
    await sourceCommand(() => checkpoint("The Without expression now lists Untracked before Selection Solo.", { keyFrames: [filterMixing] }));
  });

  await test.step(sections.steps.checkReversedResult, async () => {
    await sourceCommand(() => filterPanel.closeMixFilters());
    await sourceCommand(() => editor.expectGraphViewPageCount(0));
    await sourceCommand(() => checkpoint("Untracked without Selection Solo leaves the graph empty."));
  });

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
