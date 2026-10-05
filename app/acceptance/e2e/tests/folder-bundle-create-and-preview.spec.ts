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
import {
  PreviewPublishModal,
  BundleEditorPage,
  BundleListPage,
} from "../src/run/pages/index.js";
import { Fixture, Bundle } from "../src/run/workflows.js";
import { sourcingReviewRedesign, folderBundles, htmlGeneration, tracking } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-folder" });

test.use({ fixtureHome: Fixture.FolderStructureSingle });

/*
 * Open a bundle rooted at a recursively scanned folder and generate it. Check that its
 * pages and folder structure appear in the preview.
 */
test("previews a configured bundle from one recursively scanned folder", { annotation: { type: 'scenario-id', description: 'ce4b027f-df25-47e3-b545-f864e40a7890' } }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureSingle));
  await sourceCommand(() => editor.waitForLoad(Bundle.FolderStructureSingle));
  await sourceCommand(() => editor.expectGraphViewHasPages());
  await sourceCommand(() => editor.expectGraphEdgeKindControlsVisible());
  await sourceCommand(() => editor.expectGraphTextIsNotSelectable());
  await sourceCommand(() => editor.expectFolderScopeChangesBannerNotVisible());
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("single folder graph with two linked depth rows"));

  // --- Test start ---
  // Inspect the folder structure.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewSourceColumn(false));
  await sourceCommand(() => editor.switchToStructuralListView());
  await sourceCommand(() => editor.expectListViewSourceColumn(false));
  await sourceCommand(() => editor.expectStructuralListHasNoTrackingLabels());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Alpha note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Visual map"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Nested note"));
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent("Beta note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Outside note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beyond outside"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Frontier image"));
  await sourceCommand(() => editor.expectListViewThumbnailVisible("Frontier image", "png"));
  await sourceCommand(() => editor.expectListViewThumbnailVisible("Visual map", "svg"));
  await sourceCommand(() => editor.hoverListViewThumbnail("Visual map", "svg"));
  await sourceCommand(() => editor.expectImageHoverPreviewVisible("Visual map"));
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => editor.clickListSort("Title"));
  await sourceCommand(() => editor.expectStructuralSectionOrder("outside", [
    "Beyond outside",
    "Frontier image",
    "Outside note",
  ]));
  await sourceCommand(() => editor.clickListSort("Title"));
  await sourceCommand(() => editor.expectStructuralSectionOrder("outside", [
    "Outside note",
    "Frontier image",
    "Beyond outside",
  ]));
  await sourceCommand(() => editor.clickListSort("Distance"));
  await sourceCommand(() => editor.expectStructuralSectionOrder("outside", [
    "Outside note",
    "Beyond outside",
    "Frontier image",
  ]));
  await sourceCommand(() => editor.clickListSort("Distance"));
  await sourceCommand(() => editor.expectStructuralSectionOrder("outside", [
    "Frontier image",
    "Beyond outside",
    "Outside note",
  ]));
  await sourceCommand(() => page.mouse.move(0, 0));
  await sourceCommand(() => checkpoint("single folder recursive structure in the editor"));

  // Track the folder's contents; a folder start tracks only the folder itself.
  await sourceCommand(() => editor.trackAllReachablePages());
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("single folder contents tracked for publishing"));

  // Preview the folder home.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Alpha", 60_000));
  const folderNavigation = previewModal.generatedBundle.folderNavigation;
  await sourceCommand(() => folderNavigation.expectAvailable());
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.expectRootFolderNames(["Alpha", "Outside"]));
  await sourceCommand(() => folderNavigation.expectRootFileNames([]));
  await sourceCommand(() => folderNavigation.openFolder("Alpha"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Alpha", ["Alpha note.html"]));
  await sourceCommand(() => folderNavigation.openFolder("Alpha/Nested"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Alpha/Nested", [
    "Nested note.html",
  ]));
  await sourceCommand(() => folderNavigation.openFolder("Outside"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Outside", [
    "Beyond outside.html",
    "Outside note.html",
  ]));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralChildNames([
    "Nested",
    "Alpha note",
    "Visual map",
  ]));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralImagePreview("Visual map"));
  await sourceCommand(() => folderNavigation.close());
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("single folder generated home"));

  // Open a linked page outside the folder.
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.clickFile("Outside", "Outside note.html"));
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Outside note"));
  await sourceCommand(() => folderNavigation.expectSelectedFile("Outside note.html"));
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => checkpoint("single folder linked page in folder navigation"));

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState({
    allowedModified: [
      "bundles/single-folder-bundle/config/generated_bundle_versions.yaml",
    ],
    allowedUntracked: [
      "bundles/single-folder-bundle/raw/folder_scope_snapshot.json",
      "bundles/single-folder-bundle/raw/generation_inputs/",
      "bundles/single-folder-bundle/raw/tracked_bundle_node_config.yaml",
      "bundles/single-folder-bundle/raw/tracked_page_content/",

      "bundles/single-folder-bundle/build/",
      "bundles/single-folder-bundle/html/",
      "bundles/single-folder-bundle/raw/",
    ],
  }));
});
