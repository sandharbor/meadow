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
test("choose folders before naming a bundle and its published home page", { annotation: { type: 'scenario-id', description: '0c8889cc-f2c8-4006-ba40-06d83037b3b9' } }, async ({ sourceCommand,
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

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickCreateNewBundle());
  await sourceCommand(() => createModal.selectFolderEntryStrategy());
  await sourceCommand(() => createModal.expectFolderSelectionBeforeNaming());
  await sourceCommand(() => createModal.addFolders([path.join(sourceDir, "Alpha")]));
  expect(await sourceCommand(() => createModal.getSlugDisplayText())).toBe("alpha");
  await sourceCommand(() => createModal.expectFolderSelectionValid());
  await sourceCommand(() => addKeyFrame(folderBundles));

  await sourceCommand(() => checkpoint("the selected folder supplies the initial name"));

  // --- Test start ---
  // Try a source root outside the selected folder.
  await sourceCommand(() => createModal.changeSourceDirectory(path.join(sourceDir, "Beta")));
  await sourceCommand(() => createModal.expectFolderOutsideRoot(path.join(sourceDir, "Alpha")));
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => createModal.expectCreateDisabledTooltip());
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => createModal.changeSourceDirectory(sourceDir));
  await sourceCommand(() => createModal.expectFolderSelectionValid());

  await sourceCommand(() => checkpoint("restoring the source root makes the selection valid"));

  // Name a bundle with two folders.
  await sourceCommand(() => createModal.addFolders([path.join(sourceDir, "Beta")]));
  await sourceCommand(() => createModal.fillFolderHomePageTitle("Collected Notes"));
  expect(await sourceCommand(() => createModal.getSlugDisplayText())).toBe("collected-notes");
  await sourceCommand(() => createModal.clickEditSlug());
  await sourceCommand(() => createModal.fillSlug("reading-room"));
  await sourceCommand(() => addKeyFrame(bundleSlug));
  await sourceCommand(() => checkpoint("the home title and bundle slug are chosen independently"));

  // Create the folder bundle.
  await sourceCommand(() => createModal.clickCreateBundle());
  await sourceCommand(() => editor.waitForLoad("reading-room"));
  await sourceCommand(() => editor.expectGraphViewHasPages());
  await sourceCommand(() => checkpoint("folder bundle created with a separate list name and home title"));

  // Reopen and preview the named bundle.
  await sourceCommand(() => editor.clickBackToBundles());
  await sourceCommand(() => bundleList.clickBundle("reading-room"));
  await sourceCommand(() => editor.waitForLoad("reading-room"));
  await sourceCommand(() => editor.trackAllReachablePages());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Collected Notes", 60_000));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralChildNames(["Alpha", "Beta"]));
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("published home uses the chosen title and folder order"));

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      "bundles/reading-room/build/",
      "bundles/reading-room/config/generated_bundle_versions.yaml",
      "bundles/reading-room/html/",
      "bundles/reading-room/raw/folder_scope_snapshot.json",
      "bundles/reading-room/raw/generation_inputs/",
    ],
  }));
});
