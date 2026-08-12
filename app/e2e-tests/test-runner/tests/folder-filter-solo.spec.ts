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
import { filters, folderFilter } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test.use({ siteMode: "single-file" });

test("folder filter expands recursive counts and solos a nested folder", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await workflows.navigateToBigSite();
  await filterPanel.expectFilterVisible("Folders");
  await filterPanel.enableFilter("Folders");

  await filterPanel.expectFolderCount("t024", 4);
  await filterPanel.expandFolder("t024");
  await filterPanel.expectFolderVisible("t024/deeper");
  await filterPanel.expectFolderCount("t024/deeper", 1);
  await addKeyFrame(folderFilter);
  await snapshot("folder tree expanded with recursive counts");

  await filterPanel.soloFolder("t024/deeper");
  await page.waitForTimeout(250);
  await editor.switchToListView();
  await expect.poll(() => editor.getListViewPageCount()).toBe(1);
  await addKeyFrame(filters);
  await addKeyFrame(folderFilter);
  await snapshot("nested folder soloed");
  void bigSite;

  await assertMeadowHomeState();
});
