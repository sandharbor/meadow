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
import { filters, folderFilter } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("hidden folders are intersected with soloed folders by default", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await workflows.navigateToBigBundle();
  await filterPanel.enableFilter("Folders");
  await filterPanel.expectFolderCount("t024", 4);
  await filterPanel.expectFolderCount("t023", 4);

  await filterPanel.hideFolder("t024");
  await filterPanel.soloFolder("t023");
  await editor.expectGraphViewPageCount(4);
  await filterPanel.expectFilterGroupActive("Folders");
  await filterPanel.collapseFilterGroup("Folders");
  await filterPanel.expectFilterGroupActive("Folders");
  await filterPanel.expectMixFiltersCustomized(false);
  await filterPanel.expectMixFiltersLeftAlignedWithAddCustomFilterOnRight();

  await filterPanel.openMixFilters();
  await filterPanel.expectDefaultHideAndSoloMix({
    hides: ["Folder: t024"],
    solos: ["Folder: t023"],
  });
  await addKeyFrame(filters);
  await addKeyFrame(folderFilter);
  await snapshot("hidden and soloed folders use the default grouped mix");
  await filterPanel.closeMixFilters();

  await editor.switchToListView();
  expect(await editor.getListViewPageCount()).toBe(4);
  await snapshot("only the soloed folder remains visible");
  void bigBundle;

  await assertMeadowHomeState();
});
