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
import { filters, callout } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Solo a filter that matches no pages. The empty-graph callout should explain why the
 * pages are hidden and help restore them.
 */
test("empty solo callout appears when solo filter hides all pages", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
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

  // Switch to the list.
  await editor.switchToListView();
  await snapshot("list view");

  // Create a filter that matches nothing.
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.clickAddCustomFilter();
  await filterPanel.fillAndSaveCustomFilter({
    name: "no match",
    field: "title",
    matchType: "substring",
    value: "xyznonexistent",
  });
  await page.waitForTimeout(250);
  await snapshot("custom filter created");

  // Solo the empty filter.
  await filterPanel.enableAndSoloFilter("no match");
  await page.waitForTimeout(250);
  await snapshot("custom filter soloed with no matching pages");

  // Check the empty-view explanation.
  await editor.expectEmptySoloCalloutVisible();
  await addKeyFrame(callout);
  await snapshot("empty solo callout visible");

  // Turn off solos.
  await editor.clickTurnOffSolos();
  await page.waitForTimeout(250);
  await snapshot("solos turned off");

  // Check the restored pages.
  await editor.expectEmptySoloCalloutNotVisible();
  const pageCount = await editor.getListViewPageCount();
  expect(pageCount).toBeGreaterThan(0);
  await snapshot("pages visible again");

  void bigBundle;

  await skipMeadowHomeStateCheck();
});
