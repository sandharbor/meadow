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
import { folderBundles, htmlGeneration } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-folder" });

test.use({ fixtureHome: Fixture.FolderStructureSingle });

test("previews a configured bundle from one recursively scanned folder", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  await bundleList.goto();
  await bundleList.clickBundle(Bundle.FolderStructureSingle);
  await editor.waitForLoad(Bundle.FolderStructureSingle);
  await editor.expectGraphViewHasPages();
  await editor.expectGraphEdgeKindControlsVisible();
  await editor.expectGraphTextIsNotSelectable();
  await editor.expectFolderScopeChangesBannerNotVisible();
  await snapshot("single folder graph with two linked depth rows");
  await addKeyFrame(folderBundles);
  await editor.switchToListView();
  await editor.switchToStructuralListView();
  await editor.expectStructuralListHasNoTrackingLabels();
  await editor.expectListViewRowByExactNamePresent("Alpha note");
  await editor.expectListViewRowByExactNamePresent("Visual map");
  await editor.expectListViewRowByExactNamePresent("Nested note");
  await editor.expectListViewRowByExactNameNotPresent("Beta note");
  await editor.expectListViewRowByExactNamePresent("Outside note");
  await editor.expectListViewRowByExactNamePresent("Beyond outside");
  await editor.expectListViewRowByExactNamePresent("Frontier image");
  await editor.expectListViewThumbnailVisible("Frontier image", "png");
  await editor.expectListViewThumbnailVisible("Visual map", "svg");
  await editor.hoverListViewThumbnail("Visual map", "svg");
  await editor.expectImageHoverPreviewVisible("Visual map");
  await addKeyFrame(folderBundles);
  await editor.clickListSort("Title");
  await editor.expectStructuralSectionOrder("outside", [
    "Beyond outside",
    "Frontier image",
    "Outside note",
  ]);
  await editor.clickListSort("Title");
  await editor.expectStructuralSectionOrder("outside", [
    "Outside note",
    "Frontier image",
    "Beyond outside",
  ]);
  await editor.clickListSort("Distance");
  await editor.expectStructuralSectionOrder("outside", [
    "Outside note",
    "Beyond outside",
    "Frontier image",
  ]);
  await editor.clickListSort("Distance");
  await editor.expectStructuralSectionOrder("outside", [
    "Frontier image",
    "Beyond outside",
    "Outside note",
  ]);
  await page.mouse.move(0, 0);
  await snapshot("single folder recursive structure in the editor");

  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.generatedBundle.expectSingleHeading("Alpha", 60_000);
  const folderNavigation = previewModal.generatedBundle.folderNavigation;
  await folderNavigation.expectAvailable();
  await folderNavigation.open();
  await folderNavigation.expectRootFolderNames(["Alpha", "Outside"]);
  await folderNavigation.expectRootFileNames([]);
  await folderNavigation.openFolder("Alpha");
  await folderNavigation.expectDirectFileNames("Alpha", ["Alpha note.html"]);
  await folderNavigation.openFolder("Alpha/Nested");
  await folderNavigation.expectDirectFileNames("Alpha/Nested", [
    "Nested note.html",
  ]);
  await folderNavigation.openFolder("Outside");
  await folderNavigation.expectDirectFileNames("Outside", [
    "Beyond outside.html",
    "Outside note.html",
  ]);
  await previewModal.generatedBundle.expectStructuralChildNames([
    "Nested",
    "Alpha note",
    "Visual map",
  ]);
  await previewModal.generatedBundle.expectStructuralImagePreview("Visual map");
  await folderNavigation.close();
  await snapshot("single folder generated home");
  await addKeyFrame(htmlGeneration);
  await folderNavigation.open();
  await folderNavigation.clickFile("Outside", "Outside note.html");
  await previewModal.generatedBundle.expectSingleHeading("Outside note");
  await folderNavigation.expectSelectedFile("Outside note.html");
  await folderNavigation.open();
  await snapshot("single folder linked page in folder navigation");
  void customBundle;

  await assertMeadowHomeState({
    allowedModified: [
      "bundles/single-folder-bundle/config/generated_bundle_versions.yaml",
    ],
    allowedUntracked: [
      "bundles/single-folder-bundle/build/",
      "bundles/single-folder-bundle/html/",
      "bundles/single-folder-bundle/raw/",
    ],
  });
});
