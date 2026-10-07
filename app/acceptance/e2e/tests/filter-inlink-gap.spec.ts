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
import { linkGap, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`inlink gap filter auto-calculates threshold and selects correct pages`);

const description = linkedScenarioDescription(conceptText`Enable the incoming-link gap filter. Check its calculated threshold and the pages
selected by that threshold.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '80a06cf6-e286-4a89-926f-16bc96b26deb' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, checkpoint, assertMeadowHomeState, addKeyFrame }) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => checkpoint("bundle list loaded"));

  // --- Test start ---
  // Open the big bundle.
  await sourceCommand(() => bundleList.clickBundle("meadow-test-bundle-big"));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad("meadow-test-bundle-big"));
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // Enable the inlink-gap filter.
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.enableFilter("Inlink Gap"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("inlink gap filter enabled"));

  // Check the automatic threshold.
  const threshold = await sourceCommand(() => filterPanel.getFilterThresholdValue("Inlink Gap"));
  expect(threshold).toBe(3);
  await sourceCommand(() => addKeyFrame(linkGap));
  await sourceCommand(() => checkpoint("inlink gap threshold is 3"));

  // Solo the matching pages.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Inlink Gap"));
  await sourceCommand(() => checkpoint("inlink gap filter soloed"));

  // Select the visible pages.
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => checkpoint("all visible pages selected"));

  // Check the selection.
  const titles = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(titles.length).toBe(1);
  await sourceCommand(() => checkpoint("verified one page selected with inlink gap"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
