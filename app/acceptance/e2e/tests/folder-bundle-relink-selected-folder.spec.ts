/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from "fs";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, BundleListPage } from "../src/run/pages/index.js";
import { Fixture, Bundle } from "../src/run/workflows.js";
import { folderBundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.FolderStructureSingle });

/*
 * Move a folder bundle's selected folder away. Opening the bundle from the list asks
 * to relink the folder first; after relinking to its new location, the bundle opens
 * with its pages.
 */
test("relinks a folder bundle whose selected folder moved", async ({
  page,
  testServer,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourceDir = path.join(testServer.sourceGraphsDir, "folder-structure-test");
  const moved = path.join(sourceDir, "Alpha moved");
  fs.renameSync(path.join(sourceDir, "Alpha"), moved);
  await bundleList.goto();
  await checkpoint("the bundle's selected folder has moved");

  // --- Test start ---
  // Opening the bundle asks for the folder's new location.
  await bundleList.clickBundle(Bundle.FolderStructureSingle);
  await bundleList.expectRelinkRequired("Alpha");
  await addKeyFrame(folderBundles);
  await checkpoint("opening the bundle asks to relink its missing folder");

  // Relink it and open the bundle.
  await bundleList.relinkSelectedFolder(moved);
  await bundleList.clickBundle(Bundle.FolderStructureSingle);
  await editor.waitForLoad(Bundle.FolderStructureSingle);
  await editor.expectGraphViewHasPages();
  await checkpoint("the relinked bundle opens with its pages");

  // The moved folder is a source change; relinking records the folder's new scope.
  await assertMeadowHomeState({
    allowedUntracked: [
      "bundles/single-folder-bundle/raw/folder_scope_snapshot.json",
      "source_graphs/folder-structure-test/Alpha moved/",
    ],
    allowedModified: [
      "source_graphs/folder-structure-test/Alpha/Alpha note.md",
      "source_graphs/folder-structure-test/Alpha/Nested/Nested note.md",
      "source_graphs/folder-structure-test/Alpha/Visual map.svg",
    ],
  });
});
