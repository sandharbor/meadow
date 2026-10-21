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
import { scenarioSections, filters, callout, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`empty solo callout appears when solo filter hides all pages`);

const description = linkedScenarioDescription(conceptText`Solo a filter that matches no pages. The empty-graph callout should explain why the
pages are hidden and help restore them.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle list loaded.` },
  openBigBundle: { type: 'test', text: conceptText`Open the big bundle.` },
  switchList: { type: 'test', text: conceptText`Switch to the list.` },
  createFilterMatchesNothing: { type: 'test', text: conceptText`Create a filter that matches nothing.` },
  soloEmptyFilter: { type: 'test', text: conceptText`Solo the empty filter.` },
  checkEmptyViewExplanation: { type: 'test', text: conceptText`Check the empty-view explanation.` },
  turnOffSolos: { type: 'test', text: conceptText`Turn off solos.` },
  checkRestoredPages: { type: 'test', text: conceptText`Check the restored pages.` },
});
const areas = scenarioAreas([bundleCuration], { subAreas: [filters] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'bbf7cb88-2a18-46dc-b338-41f4305ce162' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
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
    return { editor };
  });

  await test.step(sections.steps.switchList, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => checkpoint("list view"));
  });

  const { filterPanel } = await test.step(sections.steps.createFilterMatchesNothing, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.clickAddCustomFilter());
    await sourceCommand(() => filterPanel.fillAndSaveCustomFilter({
      name: "no match",
      field: "title",
      matchType: "substring",
      value: "xyznonexistent",
    }));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("custom filter created"));
    return { filterPanel };
  });

  await test.step(sections.steps.soloEmptyFilter, async () => {
    await sourceCommand(() => filterPanel.enableAndSoloFilter("no match"));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("custom filter soloed with no matching pages"));
  });

  await test.step(sections.steps.checkEmptyViewExplanation, async () => {
    await sourceCommand(() => editor.expectEmptySoloCalloutVisible());
    await sourceCommand(() => addKeyFrame(callout));
    await sourceCommand(() => checkpoint("empty solo callout visible"));
  });

  await test.step(sections.steps.turnOffSolos, async () => {
    await sourceCommand(() => editor.clickTurnOffSolos());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("solos turned off"));
  });

  await test.step(sections.steps.checkRestoredPages, async () => {
    await sourceCommand(() => editor.expectEmptySoloCalloutNotVisible());
    const pageCount = await sourceCommand(() => editor.getListViewPageCount());
    expect(pageCount).toBeGreaterThan(0);
    await sourceCommand(() => checkpoint("pages visible again"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
