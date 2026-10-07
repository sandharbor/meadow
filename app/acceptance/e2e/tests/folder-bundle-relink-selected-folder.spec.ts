/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from "fs";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, BundleListPage } from "../src/run/pages/index.js";
import { Fixture, Bundle } from "../src/run/workflows.js";
import { folderBundles, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.FolderStructureSingle });

const name = linkedScenarioName(conceptText`relinks a folder bundle whose selected folder moved`);

const description = linkedScenarioDescription(conceptText`Move a folder bundle's selected folder away. Opening the bundle from the list asks
to relink the folder first; after relinking to its new location, the bundle opens
with its pages.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '61372431-391b-49d5-a228-243d2052d98b' }, name.annotation, description.annotation] }, async ({ sourceCommand,
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
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => checkpoint("the bundle's selected folder has moved"));

  // --- Test start ---
  // Opening the bundle asks for the folder's new location.
  await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureSingle));
  await sourceCommand(() => bundleList.expectRelinkRequired("Alpha"));
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("opening the bundle asks to relink its missing folder"));

  // Relink it and open the bundle.
  await sourceCommand(() => bundleList.relinkSelectedFolder(moved));
  await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureSingle));
  await sourceCommand(() => editor.waitForLoad(Bundle.FolderStructureSingle));
  await sourceCommand(() => editor.expectGraphViewHasPages());
  await sourceCommand(() => checkpoint("the relinked bundle opens with its pages"));

  // The moved folder is a source change; relinking records the folder's new scope.
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      "bundles/single-folder-bundle/raw/folder_scope_snapshot.json",
      "source_graphs/folder-structure-test/Alpha moved/",
    ],
    allowedModified: [
      "source_graphs/folder-structure-test/Alpha/Alpha note.md",
      "source_graphs/folder-structure-test/Alpha/Nested/Nested note.md",
      "source_graphs/folder-structure-test/Alpha/Visual map.svg",
    ],
  }));
});
