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
import { sourcingReviewRedesign, blacklist, folderBundles } from "../../../concepts/index.js";
import { Bundle, Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "multiple-folders" });
test.use({ fixtureHome: Fixture.FolderStructureMultiple });

/*
 * Blacklist one folder in a collection and inspect the reduced graph. Removing the
 * blacklist should restore its descendants and reachable pages.
 */
test("a collection member folder can be blacklisted and restored", { annotation: { type: 'scenario-id', description: '65e907d8-cdfb-4082-8465-601adb3f75bc' } }, async ({ sourceCommand,
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
  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(11));

  await sourceCommand(() => checkpoint("the full folder graph contains eleven pages"));

  // --- Test start ---
  // Blacklist the Alpha folder.
  await sourceCommand(() => editor.clickListViewRowByNodeKey("folder:Alpha"));
  await sourceCommand(() => editor.expectSelectedPageBadge("folder:Alpha", "Tracked"));
  await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
  await sourceCommand(() => editor.clickContextMenuItem("Blacklist"));
  await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
  await sourceCommand(() => checkpoint("folder boundary and departing descendants await acceptance"));
  await sourceCommand(() => editor.sourceReview.accept());

  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(4));
  await sourceCommand(() => editor.expectSelectedPageBadge("folder:Alpha", "Blacklisted"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Alpha"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta note"));
  for (const removedTitle of [
    "Alpha note",
    "Visual map",
    "Nested",
    "Nested note",
    "Outside note",
    "Beyond outside",
    "Frontier image",
  ]) {
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(removedTitle));
  }
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => addKeyFrame(blacklist));
  await sourceCommand(() => checkpoint("Alpha folder blacklist hides its working-graph subtree"));

  // Restore the folder.
  await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
  await sourceCommand(() => editor.clickContextMenuItem("Remove from Blacklist"));
  await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
  await sourceCommand(() => editor.sourceReview.accept());

  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(11));
  for (const restoredTitle of [
    "Alpha",
    "Alpha note",
    "Visual map",
    "Nested",
    "Nested note",
    "Outside note",
    "Beyond outside",
    "Frontier image",
  ]) {
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent(restoredTitle));
  }
  await sourceCommand(() => checkpoint("removing the Alpha folder blacklist restores its descendants"));

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ["bundles/ordered-folders/raw/folder_scope_snapshot.json"],
  }));
});
