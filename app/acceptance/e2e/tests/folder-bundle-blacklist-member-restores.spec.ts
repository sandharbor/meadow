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
import { blacklist, folderBundles } from "../src/scenario-docs/index.js";
import { Bundle, Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "multiple-folders" });
test.use({ fixtureHome: Fixture.FolderStructureMultiple });

test("a collection member folder can be blacklisted and restored", async ({
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
  await expect.poll(() => editor.getListViewPageCount()).toBe(10);

  await editor.clickListViewRowByNodeKey("folder:Alpha");
  await editor.expectSelectedPageBadge("folder:Alpha", "Tracked");
  await editor.rightClickListViewRowByNodeKey("folder:Alpha");
  const blacklistDialogPromise = page.waitForEvent("dialog");
  const blacklistActionPromise =
    editor.clickContextMenuItemAndAwaitAutoSaveAndGraphReload("Blacklist");
  const blacklistDialog = await blacklistDialogPromise;
  expect(blacklistDialog.message()).toContain("Blacklist 1 folder as a hard subtree boundary?");
  await blacklistDialog.accept();
  await blacklistActionPromise;

  await expect.poll(() => editor.getListViewPageCount()).toBe(4);
  await editor.expectSelectedPageBadge("folder:Alpha", "Blacklisted");
  await editor.expectListViewRowByExactNamePresent("Alpha");
  await editor.expectListViewRowByExactNamePresent("Beta");
  await editor.expectListViewRowByExactNamePresent("Beta note");
  for (const removedTitle of [
    "Alpha note",
    "Visual map",
    "Nested",
    "Nested note",
    "Outside note",
    "Beyond outside",
  ]) {
    await editor.expectListViewRowByExactNameNotPresent(removedTitle);
  }
  await addKeyFrame(folderBundles);
  await addKeyFrame(blacklist);
  await snapshot("Alpha folder blacklist hides its working-graph subtree");

  await editor.rightClickListViewRowByNodeKey("folder:Alpha");
  await editor.clickContextMenuItemAndAwaitAutoSaveAndGraphReload("Remove from Blacklist");

  await expect.poll(() => editor.getListViewPageCount()).toBe(10);
  for (const restoredTitle of [
    "Alpha",
    "Alpha note",
    "Visual map",
    "Nested",
    "Nested note",
    "Outside note",
    "Beyond outside",
  ]) {
    await editor.expectListViewRowByExactNamePresent(restoredTitle);
  }
  await snapshot("removing the Alpha folder blacklist restores its descendants");
  await assertMeadowHomeState({
    allowedUntracked: ["bundles/ordered-folders/raw/"],
  });
});
