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
import { FilterPanelComponent, SiteEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { filters } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("mix view intersects soloed untracked and sensitive filters in graph and list views", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigSite();
  await snapshot("big site loaded");

  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await filterPanel.enableAndSoloFilter("Untracked");
  await editor.expectGraphViewPageCount(11);
  await filterPanel.expectMixViewHidden();
  await snapshot("untracked filter soloed without mix view");

  await filterPanel.clickSoloOnFilter("Sensitive");
  await filterPanel.expectMixViewCustomized(false);
  await filterPanel.openMixView();
  await filterPanel.moveMixViewBy(80, 50);
  await addKeyFrame(filters);
  await snapshot("mix view defaults to any and can move aside");

  await filterPanel.chooseMixOperator("All");
  await filterPanel.closeMixView();
  await filterPanel.expectMixViewCustomized(true);
  await editor.expectGraphViewPageCount(1);
  await snapshot("graph view shows sensitive untracked intersection");

  await editor.switchToListView();
  expect(await editor.getListViewPageCount()).toBe(1);
  await snapshot("list view shows the same intersection");
  await addKeyFrame(filters);

  await filterPanel.openMixView();
  await filterPanel.resetMixView();
  await filterPanel.expectMixViewCustomized(false);
  await filterPanel.closeMixView();
  await snapshot("reset mix restores the default view");
  void bigSite;

  await assertMeadowHomeState();
});
