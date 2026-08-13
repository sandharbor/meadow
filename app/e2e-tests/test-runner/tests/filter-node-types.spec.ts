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
import { isImageFileType } from "../../../shared_code/utils/fileTypeUtils.js";

test.use({ siteMode: "single-file" });

test("type filter soloing File Nodes excludes Image Nodes", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await workflows.navigateToBigSite();
  await editor.expectGraphEdgeKindControlsHidden();
  await filterPanel.expandFilterGroup("Types");
  const fileNodeCount = await filterPanel.getNodeTypeCount("File Nodes");
  const imageNodeCount = await filterPanel.getNodeTypeCount("Image Nodes");
  expect(fileNodeCount).toBeGreaterThan(0);
  expect(imageNodeCount).toBeGreaterThan(0);
  await snapshot("type filters expanded");

  await filterPanel.soloNodeType("File Nodes");
  await editor.switchToListView();
  await expect.poll(() => editor.getListViewPageCount()).toBe(fileNodeCount);

  const visibleTypes = await editor.getListViewNodeTypes();
  expect(visibleTypes).toHaveLength(fileNodeCount);
  expect(visibleTypes.some(type => isImageFileType(type.trim().replace(/^\./, "")))).toBe(false);
  await addKeyFrame(filters);
  await snapshot("file nodes soloed with image nodes excluded");
  void bigSite;

  await assertMeadowHomeState();
});
