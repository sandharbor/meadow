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
import { sourcingReviewRedesign, folderBundles, paths } from "../../../concepts/index.js";
import { Bundle, Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "multiple-folders" });
test.use({ fixtureHome: Fixture.FolderStructureMultiple });

/*
 * Select a folder's direct children, then its deeper paths. Confirm that structural
 * descendants and linked pages are selected in the list and graph.
 */
test("folder context selections include structural children and deeper paths", { annotation: { type: 'scenario-id', description: '7d68931a-2d3c-403f-b1d4-293f0dd5f124' } }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureMultiple));
  await sourceCommand(() => editor.waitForLoad(Bundle.FolderStructureMultiple));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => checkpoint("the folder graph is ready for structural selection"));

  // --- Test start ---
  // Select direct children.
  await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
  await sourceCommand(() => editor.clickContextMenuItem("Select Children"));

  expect((await sourceCommand(() => editor.getSelectedPageTitles())).sort()).toEqual([
    "Alpha",
    "Alpha note",
    "Nested",
    "Visual map",
  ].sort());
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("Select Children includes every direct Alpha child"));

  // Select all deeper paths.
  await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
  await sourceCommand(() => editor.clickContextMenuItem("Select Deeper Paths from Here"));

  expect((await sourceCommand(() => editor.getSelectedPageTitles())).sort()).toEqual([
    "Alpha",
    "Alpha note",
    "Beyond outside",
    "Frontier image",
    "Nested",
    "Nested note",
    "Outside note",
    "Visual map",
  ].sort());
  await sourceCommand(() => editor.switchToGraphView());
  await sourceCommand(() => editor.expectGraphViewActive());
  await sourceCommand(() => addKeyFrame(paths));
  await sourceCommand(() => checkpoint("Select Deeper Paths highlights structural and linked descendants in the graph"));

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      "bundles/ordered-folders/raw/folder_scope_snapshot.json",
"bundles/ordered-folders/raw/"],
  }));
});
