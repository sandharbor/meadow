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

test.use({ siteMode: "single-file" });

test("without mix terms can be reordered by dropping one directly on the other", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigSite();

  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await editor.clickSelectAll();
  await editor.clickSoloSelection();
  await filterPanel.enableAndSoloFilter("Untracked");

  await filterPanel.openMixView();
  await filterPanel.expectMixTermOrder(["Selection Solo", "Untracked"]);
  await filterPanel.chooseMixOperator("Without");
  await filterPanel.closeMixView();
  await editor.expectGraphViewHasPages();
  await snapshot("selection without untracked pages");

  await filterPanel.openMixView();
  await filterPanel.dragMixTermOnto("Selection Solo", "Untracked");
  await filterPanel.expectMixTermOrder(["Untracked", "Selection Solo"]);
  await addKeyFrame(filters);
  await snapshot("without terms reordered directly");

  await filterPanel.closeMixView();
  await editor.expectGraphViewPageCount(0);
  await snapshot("untracked without the selected pages is empty");
  void bigSite;

  await assertMeadowHomeState();
});
