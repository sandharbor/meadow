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
import { filters } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Solo the untracked and sensitive filters, then intersect them in Mix Filters. Graph and
 * list views should show the same intersection.
 */
test("mix filters intersects soloed untracked and sensitive filters in graph and list views", async ({
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundle();
  await checkpoint("big bundle loaded");

  // --- Test start ---
  // Solo untracked pages.
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await filterPanel.enableAndSoloFilter("Untracked");
  await editor.expectGraphViewPageCount(10);
  await filterPanel.expectMixFiltersHidden();
  await checkpoint("untracked filter soloed without mix filters");

  // Add sensitive pages to the mix.
  await filterPanel.clickSoloOnFilter("Sensitive");
  await filterPanel.expectMixFiltersCustomized(false);
  await filterPanel.openMixFilters();
  await filterPanel.moveMixFiltersBy(80, 50);
  await addKeyFrame(filters);
  await checkpoint("mix filters defaults to any and can move aside");

  // Intersect the two filters.
  await filterPanel.chooseMixOperator("All");
  await filterPanel.closeMixFilters();
  await filterPanel.expectMixFiltersCustomized(true);
  await editor.expectGraphViewPageCount(1);
  await checkpoint("graph view shows sensitive untracked intersection");

  // Compare the list view.
  await editor.switchToListView();
  expect(await editor.getListViewPageCount()).toBe(1);
  await addKeyFrame(filters);
  await checkpoint("list view shows the same intersection");

  // Reset the filter mix.
  await filterPanel.openMixFilters();
  await filterPanel.resetMixFilters();
  await filterPanel.expectMixFiltersCustomized(false);
  await filterPanel.closeMixFilters();
  await checkpoint("reset mix restores the default view");

  void bigBundle;

  await assertMeadowHomeState();
});
