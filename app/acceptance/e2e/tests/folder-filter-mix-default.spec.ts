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
import { filters, folderFilter, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`hidden folders are intersected with soloed folders by default`);

const description = linkedScenarioDescription(conceptText`Hide one folder and solo another. The default filter mix should combine those choices
and show only the expected pages.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '4fa68df7-a9cd-48a7-b397-a7138cb61106' }, name.annotation, description.annotation] }, async ({ sourceCommand,
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
  await sourceCommand(() => filterPanel.enableFilter("Folders"));
  await sourceCommand(() => filterPanel.expectFolderCount("t024", 4));
  await sourceCommand(() => filterPanel.expectFolderCount("t023", 4));

  await sourceCommand(() => checkpoint("the folder counts are visible before filtering"));

  // --- Test start ---
  // Hide and solo folders.
  await sourceCommand(() => filterPanel.hideFolder("t024"));
  await sourceCommand(() => filterPanel.soloFolder("t023"));
  await sourceCommand(() => editor.expectGraphViewPageCount(4));
  await sourceCommand(() => filterPanel.expectFilterGroupActive("Folders"));
  await sourceCommand(() => filterPanel.collapseFilterGroup("Folders"));
  await sourceCommand(() => filterPanel.expectFilterGroupActive("Folders"));
  await sourceCommand(() => filterPanel.expectMixFiltersCustomized(false));
  await sourceCommand(() => filterPanel.expectMixFiltersLeftAlignedWithAddCustomFilterOnRight());

  await sourceCommand(() => filterPanel.openMixFilters());
  await sourceCommand(() => filterPanel.expectDefaultHideAndSoloMix({
    hides: ["Folder: t024"],
    solos: ["Folder: t023"],
  }));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => addKeyFrame(folderFilter));
  await sourceCommand(() => checkpoint("hidden and soloed folders use the default grouped mix"));

  // Check the resulting list.
  await sourceCommand(() => filterPanel.closeMixFilters());

  await sourceCommand(() => editor.switchToListView());
  expect(await sourceCommand(() => editor.getListViewPageCount())).toBe(4);
  await sourceCommand(() => checkpoint("only the soloed folder remains visible"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
