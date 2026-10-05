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
  ActionButton,
  PreviewPublishModal,
  BundleEditorPage,
  BundleListPage,
  Pill,
  SelectedPageDetailComponent,
} from "../src/run/pages/index.js";
import { Fixture, Bundle } from "../src/run/workflows.js";
import { sourcingReviewRedesign, frontier, htmlGeneration, tracking } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.FolderStructureSingle });

/*
 * Find an image beyond a folder bundle's normal traversal boundary and track it. The
 * tracked image should become part of the generated bundle.
 */
test("tracks a depth-three frontier image in a folder-derived bundle", { annotation: { type: 'scenario-id', description: '78112a8f-5b71-4770-b9e2-e33a205bef9f' } }, async ({ sourceCommand,
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
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("Frontier image", "png"));
  await sourceCommand(() => editor.expectListViewThumbnailVisible("Frontier image", "png"));
  await sourceCommand(() => editor.clickListViewRowByExactName("Frontier image"));

  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.expectPill(Pill.FrontierImage));
  await sourceCommand(() => detail.expectNoPill(Pill.Frontier));
  await sourceCommand(() => detail.expectNoPill(Pill.Tracked));
  await sourceCommand(() => detail.expectButtonEnabled(ActionButton.Track));
  await sourceCommand(() => addKeyFrame(frontier));
  await sourceCommand(() => checkpoint("depth-three frontier image is available to track"));

  // --- Test start ---
  // Track the frontier image.
  await sourceCommand(() => detail.clickAction(ActionButton.Track, page));
  await sourceCommand(() => detail.expectPill(Pill.FrontierImage));
  await sourceCommand(() => detail.expectPill(Pill.Tracked));
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("depth-three frontier image tracked in the folder bundle"));

  // Preview the tracked image.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewComplete());
  await sourceCommand(() => previewModal.generatedBundle.expectSingleHeading("Alpha", 60_000));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("folder preview succeeds with the tracked frontier image"));

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState({
    allowedModified: [
      "bundles/single-folder-bundle/config/generated_bundle_versions.yaml",
    ],
    allowedUntracked: [
      "bundles/single-folder-bundle/raw/generation_inputs/",

      "bundles/single-folder-bundle/build/",
      "bundles/single-folder-bundle/html/",
      "bundles/single-folder-bundle/raw/",
      "bundles/single-folder-bundle/raw/folder_scope_snapshot.json",
      "bundles/single-folder-bundle/raw/tracked_bundle_node_config.yaml",
      "bundles/single-folder-bundle/raw/tracked_page_content/Alpha/",
      "bundles/single-folder-bundle/raw/tracked_page_content/Outside/Beyond outside.md",
      "bundles/single-folder-bundle/raw/tracked_page_content/Outside/Outside note.md",
    ],
  }));
});
