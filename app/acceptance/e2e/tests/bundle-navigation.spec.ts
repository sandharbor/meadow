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
import { AppPlace, BundleListPage, BundleEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { appPlace, bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Open a bundle from the list and inspect its graph. The editor should show the bundle's
 * pages and navigation controls. Each page's menu opens its dialogs, which close
 * without leaving the page. Opening Preview adds a history entry, so browser Back
 * closes Preview, then returns to the list, and Forward replays both.
 */
test("navigate from bundle list to bundle and see graph view", async ({ page, checkpoint, assertMeadowHomeState }) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await checkpoint("bundle list loaded");

  // --- Test start ---
  // Open and close the bundle's dialogs from the list.
  const places = new AppPlace(page, expect);
  await bundleList.openAndCloseBundleAction("meadow-test-bundle-big", "Edit bundle details", "Edit Bundle Details");
  await bundleList.openAndCloseBundleAction("meadow-test-bundle-big", "Rename bundle", "Rename bundle");
  await places.expectCurrent("/");
  await checkpoint("the list's bundle dialogs open and close");

  // Open the big bundle.
  await bundleList.clickBundle("meadow-test-bundle-big");
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-bundle-big");

  await editor.expectGraphViewActive();
  await checkpoint("graph view visible");

  // Open and close the bundle's dialogs from its options.
  await editor.openAndCloseBundleOption("Edit bundle details", "Edit Bundle Details");
  await editor.openAndCloseBundleOption("Bundle logs", "Bundle logs");
  await places.expectCurrent("/bundle/meadow-test-bundle-big");
  await checkpoint("the bundle's option dialogs open and close");

  // Open Preview, then step through history.
  const preview = page.getByRole("dialog", { name: "Preview and publish" });
  await editor.clickPreview();
  await expect(preview).toBeVisible();
  await places.expectUrlMatching(/^\/bundle\/meadow-test-bundle-big\?surface=preview&step=review&tab=bundle-preview/);
  // Let the preview finish generating, so closing it does not cancel the run.
  await new PreviewPublishModal(page, expect).waitForPreviewComplete();
  await places.back();
  await expect(preview).toBeHidden();
  await places.expectCurrent("/bundle/meadow-test-bundle-big");
  await places.back();
  await places.expectCurrent("/");
  await places.forward();
  await places.expectCurrent("/bundle/meadow-test-bundle-big");
  await places.forward();
  await expect(preview).toBeVisible();
  await places.expectCurrentMatching(/^\/bundle\/meadow-test-bundle-big\?surface=preview&step=review&tab=bundle-preview/);
  await new PreviewPublishModal(page, expect).waitForPreviewComplete();
  await checkpoint("Back and Forward move through the bundle list, the bundle, and Preview");

  void bigBundle;
  void bundles;
  void appPlace;

  // Opening Preview generates the bundle.
  await assertMeadowHomeState({
    allowedUntracked: [
      "bundles/meadow-test-bundle-big/build/",
      "bundles/meadow-test-bundle-big/config/generated_bundle_versions.yaml",
      "bundles/meadow-test-bundle-big/html/",
      "bundles/meadow-test-bundle-big/raw/generation_inputs/",
      "bundles/meadow-test-bundle-big/raw/tracked_page_content/",
    ],
  });
});
