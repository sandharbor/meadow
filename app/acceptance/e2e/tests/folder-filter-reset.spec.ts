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
import { filters, folderFilter } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Hide a nested folder and collapse its parent. The parent should indicate the hidden
 * activity, and Reset should restore every page.
 */
test("folder filter exposes collapsed activity and reset restores all pages", async ({
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await workflows.navigateToBigBundle();
  await filterPanel.enableFilter("Folders");
  await editor.switchToListView();
  const initialPageCount = await editor.getListViewPageCount();
  expect(initialPageCount).toBeGreaterThan(1);

  await checkpoint("the unfiltered list is ready");

  // --- Test start ---
  // Hide a nested folder.
  await filterPanel.expandFolder("t024");
  await filterPanel.hideFolder("t024/deeper");
  await expect.poll(() => editor.getListViewPageCount()).toBe(initialPageCount - 1);
  await filterPanel.collapseFolder("t024");
  await filterPanel.expectDescendantActivity("t024");
  await addKeyFrame(filters);
  await addKeyFrame(folderFilter);
  await checkpoint("collapsed folder shows nested hide activity");

  // Reset the folder filters.
  await filterPanel.resetFolderFilters();
  await expect.poll(() => editor.getListViewPageCount()).toBe(initialPageCount);
  await filterPanel.expectNoDescendantActivity("t024");
  await filterPanel.expectFolderResetHidden();
  await checkpoint("folder filters reset");

  void bigBundle;

  await assertMeadowHomeState();
});
