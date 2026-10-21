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
import { BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, labels, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`enabling show titles on untracked filter displays page title labels`);

const description = linkedScenarioDescription(conceptText`Enable title labels for untracked pages. Their names should appear in the graph without
changing tracking state.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle editor loaded.` },
  enableUntrackedPages: { type: 'test', text: conceptText`Enable untracked pages.` },
  showTheirTitles: { type: 'test', text: conceptText`Show their titles.` },
  verifyKnownUntrackedPageTitleVisibleAs: { type: 'test', text: conceptText`Verify that a known untracked page title is visible as a label` },
  soloUntrackedPages: { type: 'test', text: conceptText`Solo untracked pages.` },
  soloUntrackedFilter: { type: 'test', text: conceptText`Solo the untracked filter` },
  takeAnotherKeyframeInSoloMode: { type: 'test', text: conceptText`Take another keyframe in solo mode` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '3af9ece8-3c3c-42c7-bd86-c15b2e792017' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, assertMeadowHomeState, addKeyFrame }) => {
  await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundle());
    await sourceCommand(() => checkpoint("bundle editor loaded"));
  });

  const { filterPanel } = await test.step(sections.steps.enableUntrackedPages, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.enableFilter("Untracked"));
    await sourceCommand(() => checkpoint("untracked filter enabled"));
    return { filterPanel };
  });

  await test.step(sections.steps.showTheirTitles, async () => {
    await sourceCommand(() => filterPanel.clickShowTitlesOnFilter("Untracked"));
    await sourceCommand(() => page.waitForTimeout(300));
  });

  await test.step(sections.steps.verifyKnownUntrackedPageTitleVisibleAs, async () => {
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.expectLabelVisible("t012 - custom filters"));
    await sourceCommand(() => checkpoint("titles shown for untracked pages"));
  });

  await test.step(sections.steps.soloUntrackedPages, async () => {
    await sourceCommand(() => addKeyFrame(labels));
  });

  await test.step(sections.steps.soloUntrackedFilter, async () => {
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Untracked"));
    await sourceCommand(() => page.waitForTimeout(300));
    await sourceCommand(() => checkpoint("untracked filter soloed with titles"));
  });

  await test.step(sections.steps.takeAnotherKeyframeInSoloMode, async () => {
    await sourceCommand(() => addKeyFrame(labels));
  });

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
