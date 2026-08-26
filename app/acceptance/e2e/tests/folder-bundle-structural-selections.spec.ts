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
import { BundleEditorPage, BundleListPage } from "../src/run/pages/index.js";
import { folderBundles, paths } from "../../../concepts/index.js";
import { Bundle, Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "multiple-folders" });
test.use({ fixtureHome: Fixture.FolderStructureMultiple });

test("folder context selections include structural children and deeper paths", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  await bundleList.goto();
  await bundleList.clickBundle(Bundle.FolderStructureMultiple);
  await editor.waitForLoad(Bundle.FolderStructureMultiple);
  await editor.switchToListView();
  await editor.rightClickListViewRowByNodeKey("folder:Alpha");
  await editor.clickContextMenuItem("Select Children");

  expect((await editor.getSelectedPageTitles()).sort()).toEqual([
    "Alpha",
    "Alpha note",
    "Nested",
    "Visual map",
  ].sort());
  await addKeyFrame(folderBundles);
  await snapshot("Select Children includes every direct Alpha child");

  await editor.rightClickListViewRowByNodeKey("folder:Alpha");
  await editor.clickContextMenuItem("Select Deeper Paths from Here");

  expect((await editor.getSelectedPageTitles()).sort()).toEqual([
    "Alpha",
    "Alpha note",
    "Beyond outside",
    "Nested",
    "Nested note",
    "Outside note",
    "Visual map",
  ].sort());
  await editor.switchToGraphView();
  await editor.expectGraphViewActive();
  await addKeyFrame(paths);
  await snapshot("Select Deeper Paths highlights structural and linked descendants in the graph");
  await assertMeadowHomeState({
    allowedUntracked: ["bundles/ordered-folders/raw/"],
  });
});
