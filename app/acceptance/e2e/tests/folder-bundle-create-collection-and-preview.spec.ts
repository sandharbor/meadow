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
import { sourcingReviewRedesign, folderBundles, htmlGeneration, tracking, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "multiple-folders" });

test.use({ fixtureHome: Fixture.FolderStructureMultiple });

const name = linkedScenarioName(conceptText`previews a configured multiple-folder collection bundle`);

const description = linkedScenarioDescription(conceptText`Generate a bundle assembled from several folders. The preview should preserve the
collection's home page, folder order, and contents.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'df33875b-e30f-4dba-8c86-b342facc6d2e' }, name.annotation, description.annotation] }, async ({ sourceCommand,
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
  await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureMultiple));
  await sourceCommand(() => editor.waitForLoad(Bundle.FolderStructureMultiple));
  await sourceCommand(() => editor.expectGraphViewHasPages());
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("multiple folder graph with two linked depth rows"));

  // --- Test start ---
  // Inspect the ordered structure.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.switchToStructuralListView());
  await sourceCommand(() => editor.expectStructuralListHasNoSelectionColumn());
  await sourceCommand(() => editor.expectListViewNodeGlyph("Ordered Folders", "collection"));
  await sourceCommand(() => editor.expectListViewNodeGlyph("Beta", "folder"));
  await sourceCommand(() => editor.expectListViewNodeGlyph("Beta note", "file"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Ordered Folders"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Alpha"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Alpha note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Visual map"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Nested note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Outside note"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beyond outside"));
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Frontier image"));
  await sourceCommand(() => checkpoint("ordered folder structure in the editor"));

  // Track the folders' contents; folder starts track only the folders themselves.
  await sourceCommand(() => editor.trackAllReachablePages());
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("ordered folder contents tracked for publishing"));

  // Preview the collection home.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Ordered Folders", 60_000));
  const folderNavigation = previewModal.generatedBundle.folderNavigation;
  await sourceCommand(() => folderNavigation.expectAvailable());
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.expectRootFolderNames(["Alpha", "Beta", "Outside"]));
  await sourceCommand(() => folderNavigation.expectRootFileNames([]));
  await sourceCommand(() => folderNavigation.openFolder("Alpha"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Alpha", [
    "Alpha note.html",
  ]));
  await sourceCommand(() => folderNavigation.openFolder("Beta"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Beta", [
    "Beta note.html",
  ]));
  await sourceCommand(() => folderNavigation.openFolder("Outside"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("Outside", [
    "Beyond outside.html",
    "Outside note.html",
  ]));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralChildNames(["Beta", "Alpha"]));
  await sourceCommand(() => folderNavigation.close());
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("ordered collection generated home"));

  // Open a page in a selected folder.
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.clickFile("Alpha", "Alpha note.html"));
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Alpha note"));
  await sourceCommand(() => folderNavigation.expectSelectedFile("Alpha note.html"));
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => checkpoint("ordered collection selected folder page"));

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState({
    allowedModified: [
      "bundles/ordered-folders/config/generated_bundle_versions.yaml",
    ],
    allowedUntracked: [
      "bundles/ordered-folders/raw/folder_scope_snapshot.json",
      "bundles/ordered-folders/raw/generation_inputs/",
      "bundles/ordered-folders/raw/tracked_bundle_node_config.yaml",
      "bundles/ordered-folders/raw/tracked_page_content/",

      "bundles/ordered-folders/build/",
      "bundles/ordered-folders/html/",
      "bundles/ordered-folders/raw/",
    ],
  }));
});
