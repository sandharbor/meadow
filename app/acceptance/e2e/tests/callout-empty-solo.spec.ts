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
import { filters, callout, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`empty solo callout appears when solo filter hides all pages`);

const description = linkedScenarioDescription(conceptText`Solo a filter that matches no pages. The empty-graph callout should explain why the
pages are hidden and help restore them.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'bbf7cb88-2a18-46dc-b338-41f4305ce162' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
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

  // Switch to the list.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => checkpoint("list view"));

  // Create a filter that matches nothing.
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

  // Solo the empty filter.
  await sourceCommand(() => filterPanel.enableAndSoloFilter("no match"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("custom filter soloed with no matching pages"));

  // Check the empty-view explanation.
  await sourceCommand(() => editor.expectEmptySoloCalloutVisible());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("empty solo callout visible"));

  // Turn off solos.
  await sourceCommand(() => editor.clickTurnOffSolos());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("solos turned off"));

  // Check the restored pages.
  await sourceCommand(() => editor.expectEmptySoloCalloutNotVisible());
  const pageCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(pageCount).toBeGreaterThan(0);
  await sourceCommand(() => checkpoint("pages visible again"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
