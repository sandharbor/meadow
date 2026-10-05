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
import {
  ActionButton,
  BundleEditorPage,
  BundleListPage,
  CreateAndEditBundleModal,
  PreviewPublishModal,
  SelectedPageDetailComponent,
} from "../src/run/pages/index.js";
import { MeadowHomeBundleConfig } from "../src/run/utils/MeadowHomeBundleConfig.js";
import { Fixture } from "../src/run/workflows.js";
import { callout, folderBundles, tracking } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.FolderStructureSingle });

/*
 * Create a folder bundle whose selected folder is also the Notes Root, keeping the
 * default traversal. Only the folder itself is tracked, so preview first explains
 * that only the starting selection is tracked, and the generated bundle contains
 * none of the untracked pages or folder names beneath it. Tracking one nested page
 * then publishes exactly that page.
 */
test("previews a new folder bundle without publishing its untracked descendants", { annotation: { type: 'scenario-id', description: '51a96f0d-bf07-483a-aa21-c5ca76ab965f' } }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const sourceDir = path.join(testServer.sourceGraphsDir, "folder-structure-test");
  const slug = "folder-structure-test";
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, slug, expect);

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickCreateNewBundle());
  await sourceCommand(() => createModal.selectFolderEntryStrategy());
  await sourceCommand(() => createModal.addFolders([sourceDir]));
  await sourceCommand(() => createModal.changeSourceDirectory(sourceDir));
  await sourceCommand(() => createModal.expectFolderSelectionValid());
  await sourceCommand(() => createModal.clickCreateBundle());
  await sourceCommand(() => editor.waitForLoad(slug));
  expect(bundleConfig.readNodes().map(node => node.bundleNodeKind)).toEqual(["folder"]);
  await sourceCommand(() => checkpoint("the new folder bundle tracks only its selected folder"));

  // --- Test start ---
  // Preview while only the starting folder is tracked.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => editor.expectStartingSelectionsPreviewWarningVisible());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("preview explains that only the starting folder is tracked"));

  // Preview anyway; nothing beneath the folder is published.
  await sourceCommand(() => editor.clickPreviewAnyway());
  await sourceCommand(() => previewModal.waitForPreviewComplete());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading(slug, 60_000));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralChildNames([]));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralEmptyMessage(
    "No pages in this folder are included in this bundle.",
  ));
  const folderNavigation = previewModal.generatedBundle.folderNavigation;
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.expectRootFolderNames([]));
  await sourceCommand(() => folderNavigation.expectRootFileNames([]));
  expect(bundleConfig.generatedPreviewPages()).toEqual(["index.html"]);
  await sourceCommand(() => addKeyFrame(folderBundles));
  await sourceCommand(() => checkpoint("the preview contains only the starting folder page"));

  // Track one nested page and preview again.
  await sourceCommand(() => previewModal.closeModal());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName("Nested note"));
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.clickAction(ActionButton.Track, page));
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewComplete());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading(slug, 60_000));
  await sourceCommand(() => previewModal.generatedBundle.expectStructuralChildNames(["Nested note"]));
  expect(bundleConfig.generatedPreviewPages()).toEqual([
    "Alpha/Nested/Nested note.html",
    "index.html",
  ]);
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("only the explicitly tracked page is published"));

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      `bundles/${slug}/build/`,
      `bundles/${slug}/html/`,
      `bundles/${slug}/raw/folder_scope_snapshot.json`,
      `bundles/${slug}/raw/generation_inputs/`,
    ],
  }));
});
