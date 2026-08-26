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

test.use({ bundleMode: "multiple-folders" });

test.use({ fixtureHome: Fixture.FolderStructureMultiple });

test("previews a configured multiple-folder collection bundle", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  await bundleList.goto();
  await bundleList.clickBundle(Bundle.FolderStructureMultiple);
  await editor.waitForLoad(Bundle.FolderStructureMultiple);
  await editor.expectGraphViewHasPages();
  await snapshot("multiple folder graph with two linked depth rows");
  await addKeyFrame(folderBundles);
  await editor.switchToListView();
  await editor.switchToStructuralListView();
  await editor.expectStructuralListHasNoSelectionColumn();
  await editor.expectListViewNodeGlyph("Ordered Folders", "collection");
  await editor.expectListViewNodeGlyph("Beta", "folder");
  await editor.expectListViewNodeGlyph("Beta note", "file");
  await editor.expectListViewRowByExactNamePresent("Ordered Folders");
  await editor.expectListViewRowByExactNamePresent("Beta");
  await editor.expectListViewRowByExactNamePresent("Alpha");
  await editor.expectListViewRowByExactNamePresent("Beta note");
  await editor.expectListViewRowByExactNamePresent("Alpha note");
  await editor.expectListViewRowByExactNamePresent("Visual map");
  await editor.expectListViewRowByExactNamePresent("Nested note");
  await editor.expectListViewRowByExactNamePresent("Outside note");
  await editor.expectListViewRowByExactNamePresent("Beyond outside");
  await snapshot("ordered folder structure in the editor");

  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.generatedBundle.expectSingleHeading("Ordered Folders", 60_000);
  const folderNavigation = previewModal.generatedBundle.folderNavigation;
  await folderNavigation.expectAvailable();
  await folderNavigation.open();
  await folderNavigation.expectRootFolderNames(["Alpha", "Beta", "Outside"]);
  await folderNavigation.expectRootFileNames([]);
  await folderNavigation.openFolder("Alpha");
  await folderNavigation.expectDirectFileNames("Alpha", [
    "Alpha note.html",
  ]);
  await folderNavigation.openFolder("Beta");
  await folderNavigation.expectDirectFileNames("Beta", [
    "Beta note.html",
  ]);
  await folderNavigation.openFolder("Outside");
  await folderNavigation.expectDirectFileNames("Outside", [
    "Beyond outside.html",
    "Outside note.html",
  ]);
  await previewModal.generatedBundle.expectStructuralChildNames(["Beta", "Alpha"]);
  await folderNavigation.close();
  await snapshot("ordered collection generated home");
  await addKeyFrame(htmlGeneration);
  await folderNavigation.open();
  await folderNavigation.clickFile("Alpha", "Alpha note.html");
  await previewModal.generatedBundle.expectSingleHeading("Alpha note");
  await folderNavigation.expectSelectedFile("Alpha note.html");
  await folderNavigation.open();
  await snapshot("ordered collection selected folder page");
  void customBundle;

  await assertMeadowHomeState({
    allowedModified: [
      "bundles/ordered-folders/config/generated_bundle_versions.yaml",
    ],
    allowedUntracked: [
      "bundles/ordered-folders/build/",
      "bundles/ordered-folders/html/",
      "bundles/ordered-folders/raw/",
    ],
  });
});
