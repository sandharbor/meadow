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
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { scenarioSections, sourcingReviewRedesign, filters, overrides, initialPage, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { exampleBundle, exampleBundleInitialPageTitle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`overrides filter on example bundle does not include the initial page`);

const description = linkedScenarioDescription(conceptText`Apply the Overrides filter to the example bundle. The initial page's required depths
should not count as a custom override.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: example bundle loaded.` },
  enableOverrideFilter: { type: 'test', text: conceptText`Enable the override filter.` },
  soloOverriddenPages: { type: 'test', text: conceptText`Solo the overridden pages.` },
  switchListViewInspectWhichPagesAre: { type: 'test', text: conceptText`Switch to list view to inspect which pages are shown` },
  thereShouldBeAtLeastOneOverride: { type: 'test', text: conceptText`There should be at least one override page (e.g. "Cognitive Biases")` },
  initialPageMustNOTAppearDepthSetting: { type: 'test', text: conceptText`The initial page must NOT appear — its depth setting is not an override` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '234c4657-7b31-4f5a-9e4c-750bbbf1c5e7' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page, checkpoint, assertMeadowHomeState, addKeyFrame,
}) => {
  const { editor, filterPanel } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const filterPanel = new FilterPanelComponent(page, expect);

    // Add the example bundle from the empty state
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.clickAddExampleBundleLink());
    await sourceCommand(() => editor.waitForLoad("example-bundle"));
    await sourceCommand(() => checkpoint("example bundle loaded"));
    return { editor, filterPanel };
  });

  await test.step(sections.steps.enableOverrideFilter, async () => {
    await sourceCommand(() => filterPanel.enableFilter("Depth Override"));
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => checkpoint("overrides filter enabled"));
  });

  await test.step(sections.steps.soloOverriddenPages, async () => {
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Depth Override"));
    await sourceCommand(() => page.waitForTimeout(250));
  });

  await test.step(sections.steps.switchListViewInspectWhichPagesAre, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
  });

  await test.step(sections.steps.thereShouldBeAtLeastOneOverride, async () => {
    const overrideCount = await sourceCommand(() => editor.getListViewPageCount());
    expect(overrideCount).toBeGreaterThan(0);
  });

  await test.step(sections.steps.initialPageMustNOTAppearDepthSetting, async () => {
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(exampleBundleInitialPageTitle));
    await sourceCommand(() => addKeyFrame(overrides));
    await sourceCommand(() => addKeyFrame(initialPage));
    await sourceCommand(() => checkpoint("overrides soloed without initial page"));
  });

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
