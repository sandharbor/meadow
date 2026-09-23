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
import { linkGap } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Enable the incoming-link gap filter. Check its calculated threshold and the pages
 * selected by that threshold.
 */
test("inlink gap filter auto-calculates threshold and selects correct pages", async ({ page, snapshot, assertMeadowHomeState, addKeyFrame }) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await snapshot("bundle list loaded");

  // --- Test start ---
  // Open the big bundle.
  await bundleList.clickBundle("meadow-test-bundle-big");
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-bundle-big");
  await snapshot("bundle editor loaded");

  // Enable the inlink-gap filter.
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Inlink Gap");
  await page.waitForTimeout(250);
  await snapshot("inlink gap filter enabled");

  // Check the automatic threshold.
  const threshold = await filterPanel.getFilterThresholdValue("Inlink Gap");
  expect(threshold).toBe(3);
  await addKeyFrame(linkGap);
  await snapshot("inlink gap threshold is 3");

  // Solo the matching pages.
  await filterPanel.clickSoloOnFilter("Inlink Gap");
  await snapshot("inlink gap filter soloed");

  // Select the visible pages.
  await editor.clickSelectAll();
  await snapshot("all visible pages selected");

  // Check the selection.
  const titles = await editor.getSelectedPageTitles();
  expect(titles.length).toBe(1);
  await snapshot("verified one page selected with inlink gap");

  void bigBundle;

  await assertMeadowHomeState();
});
