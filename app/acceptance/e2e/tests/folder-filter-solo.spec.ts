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
 * Expand the folder filter and inspect recursive counts. Soloing a nested folder should
 * show only its pages.
 */
test("folder filter expands recursive counts and solos a nested folder", { annotation: { type: 'scenario-id', description: '2a6ce90c-a040-4ce7-b989-bba49761e948' } }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await sourceCommand(() => workflows.navigateToBigBundle());
  await sourceCommand(() => filterPanel.expectFilterVisible("Folders"));
  await sourceCommand(() => filterPanel.enableFilter("Folders"));

  await sourceCommand(() => filterPanel.expectFolderCount("t024", 4));
  await sourceCommand(() => filterPanel.expandFolder("t024"));
  await sourceCommand(() => filterPanel.expectFolderVisible("t024/deeper"));
  await sourceCommand(() => filterPanel.expectFolderCount("t024/deeper", 1));
  await sourceCommand(() => addKeyFrame(folderFilter));
  await sourceCommand(() => checkpoint("folder tree expanded with recursive counts"));

  // --- Test start ---
  // Solo the nested folder.
  await sourceCommand(() => filterPanel.soloFolder("t024/deeper"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(1));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => addKeyFrame(folderFilter));
  await sourceCommand(() => checkpoint("nested folder soloed"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
