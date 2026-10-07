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
import { filters, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`filter custom inlink title substring selects expected pages`);

const description = linkedScenarioDescription(conceptText`Create a custom filter using part of an incoming page title. Verify that it selects the
expected linked pages.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '12868fe8-be7a-4880-b45e-3ed0f10a2e54' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
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

  // Create a custom filter.
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.clickAddCustomFilter());
  await sourceCommand(() => checkpoint("custom filter modal open"));

  // Match titles containing inlink.
  await sourceCommand(() => filterPanel.fillAndSaveCustomFilter({
    name: "inlink in title",
    field: "title",
    matchType: "substring",
    value: "inlink",
  }));
  await sourceCommand(() => checkpoint("custom filter saved"));

  // Solo the matching pages.
  await sourceCommand(() => page.waitForTimeout(250));

  await sourceCommand(() => filterPanel.clickSoloOnFilter("inlink in title"));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("filter soloed"));

  // Select the visible pages.
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => checkpoint("all visible pages selected"));

  // Check their titles.
  const titles = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(titles.length).toBe(7);
  for (const title of titles) {
    expect(title.toLowerCase()).toContain("inlink");
  }
  await sourceCommand(() => checkpoint("verified selected page titles"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
