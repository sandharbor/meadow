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
import { frontier } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Inspect pages beyond the traversal boundary and change the traversal depth. The frontier
 * should update as pages enter or leave the working graph.
 */
test("frontier nodes show filtered pages and respond to depth changes", async ({ page, snapshot, assertMeadowHomeState, addKeyFrame }) => {
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

  // Enable frontier pages.
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Frontier");
  await page.waitForTimeout(250);
  await snapshot("frontier pages shown");

  // Solo the frontier.
  await filterPanel.clickSoloOnFilter("Frontier");
  await addKeyFrame(frontier);
  await snapshot("frontier filter soloed");

  // Inspect the nearby frontier pages.
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const countAtDepth1 = await editor.getListViewPageCount();
  expect(countAtDepth1).toBe(7);
  await snapshot("list view with 7 frontier pages at depth 1");

  // Extend the frontier depth.
  // Increase frontier depth to 2 and verify 10 bundle pages
  // Wait longer than the 300ms debounce in FilterPanel + API fetch time
  await filterPanel.setFilterThresholdValue("Frontier", 2);
  await page.waitForTimeout(1000);
  const countAtDepth2 = await editor.getListViewPageCount();
  expect(countAtDepth2).toBe(10);
  await snapshot("list view with 10 frontier pages at depth 2");

  // Inspect a distant frontier page.
  await editor.clickListViewRow(9);
  await page.waitForTimeout(250);

  // Get the selected page detail card from the sidebar
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.openDetails();
  await page.waitForTimeout(250);

  // Frontier pages should not be trackable or blacklistable
  await detail.expectButtonDisabled(ActionButton.Track);
  await detail.expectButtonDisabled(ActionButton.Blacklist);

  // Should show "Frontier" pill but not "Tracked" pill
  await detail.expectPill(Pill.Frontier);
  await detail.expectNoPill(Pill.Tracked);
  await snapshot("frontier page details with disabled track and blacklist");

  // Return to the full graph.
  await editor.switchToGraphView();
  await page.waitForTimeout(250);
  await filterPanel.clickSoloOnFilter("Frontier");
  await snapshot("frontier depth 2 with all nodes showing");

  void bigBundle;

  await assertMeadowHomeState();
});
