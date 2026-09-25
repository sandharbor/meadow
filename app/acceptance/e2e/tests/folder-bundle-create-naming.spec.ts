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

import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal, PreviewPublishModal } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { folderBundles, bundleSlug } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.FolderStructureSingle });

/*
 * Select folders before naming a bundle and its home page. Check invalid source roots, an
 * independently chosen slug, and the resulting preview title.
 */
test("choose folders before naming a bundle and its published home page", async ({
  page,
  testServer,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const sourceDir = path.join(testServer.sourceGraphsDir, "folder-structure-test");

  await bundleList.goto();
  await bundleList.clickCreateNewBundle();
  await createModal.selectFolderEntryStrategy();
  await createModal.expectFolderSelectionBeforeNaming();
  await createModal.addFolders([path.join(sourceDir, "Alpha")]);
  expect(await createModal.getSlugDisplayText()).toBe("alpha");
  await createModal.expectFolderSelectionValid();
  await addKeyFrame(folderBundles);

  await checkpoint("the selected folder supplies the initial name");

  // --- Test start ---
  // Try a source root outside the selected folder.
  await createModal.changeSourceDirectory(path.join(sourceDir, "Beta"));
  await createModal.expectFolderOutsideRoot(path.join(sourceDir, "Alpha"));
  await addKeyFrame(folderBundles);
  await createModal.expectCreateDisabledTooltip();
  await addKeyFrame(folderBundles);
  await createModal.changeSourceDirectory(sourceDir);
  await createModal.expectFolderSelectionValid();

  await checkpoint("restoring the source root makes the selection valid");

  // Name a bundle with two folders.
  await createModal.addFolders([path.join(sourceDir, "Beta")]);
  await createModal.fillFolderHomePageTitle("Collected Notes");
  expect(await createModal.getSlugDisplayText()).toBe("collected-notes");
  await createModal.clickEditSlug();
  await createModal.fillSlug("reading-room");
  await addKeyFrame(bundleSlug);
  await checkpoint("the home title and bundle slug are chosen independently");

  // Create the folder bundle.
  await createModal.clickCreateBundle();
  await editor.waitForLoad("reading-room");
  await editor.expectGraphViewHasPages();
  await checkpoint("folder bundle created with a separate list name and home title");

  // Reopen and preview the named bundle.
  await editor.clickBackToBundles();
  await bundleList.clickBundle("reading-room");
  await editor.waitForLoad("reading-room");
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.generatedBundle.expectSingleHeading("Collected Notes", 60_000);
  await previewModal.generatedBundle.expectStructuralChildNames(["Alpha", "Beta"]);
  await addKeyFrame(folderBundles);
  await checkpoint("published home uses the chosen title and folder order");

  void customBundle;

  await assertMeadowHomeState({
    allowedUntracked: [
      "bundles/reading-room/build/",
      "bundles/reading-room/config/generated_bundle_versions.yaml",
      "bundles/reading-room/html/",
      "bundles/reading-room/raw/",
    ],
  });
});
