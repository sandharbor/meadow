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
import { BundleListPage, BundleEditorPage, PreviewPublishModal, CustomizeTab, ChangesTab } from "../src/run/pages/index.js";
import { htmlGeneration, hooks } from "../../../concepts/index.js";
import { hooksBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_hooks" });

/*
 * Preview a page-title hook, edit it, and preview again. The generated title should follow
 * the updated hook.
 */
test("Hooks preview shows normalized title and editing hook updates it", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // --- Setup ---
  // Navigate to bundle list and click the hooks test bundle
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await snapshot("bundle list loaded");

  // --- Test start ---
  // Open the hooks bundle.
  await bundleList.clickBundle("meadow-test-bundle-for-hooks");
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-bundle-for-hooks");
  await snapshot("bundle editor loaded - graph view, nothing untracked");

  // Preview the bundle.
  await editor.clickPreview();
  const modal = new PreviewPublishModal(page, expect);
  await modal.waitForPreviewCompleteAllTracked();
  await snapshot("preview completed");

  // Check the hook-generated title.
  // Verify the preview iframe shows the page title normalized by the hook:
  // "V Dwarkesh and Anthropic CEO in 2023" → "video - Dwarkesh and Anthropic CEO in 2023"
  await modal.expectPreviewIframeHeading("video - Dwarkesh and Anthropic CEO in 2023");
  await addKeyFrame(htmlGeneration);
  await snapshot("verified page title with video hook");

  // Open the global hooks.
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.hooks.switchScopeToGlobal();
  await snapshot("hooks panel in global scope");

  // Edit the page-title hook.
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await pageTitleHook.clickEdit();
  await snapshot("hook editor opened");

  // Change the title wording.
  await pageTitleHook.modifyContent("'video'", "'vulkan'");
  await snapshot("hook content modified");

  // Save and regenerate.
  // Save the hook — this triggers preview regeneration via SSE stream.
  // Response headers mark the start of generation. The updated heading can
  // appear while output is still staging, so also wait for regeneration to
  // finish before teardown captures the generated files.
  const previewStreamStarted = page.waitForResponse(
    (resp) => resp.url().includes("/preview-stream")
  );
  await pageTitleHook.save();
  await previewStreamStarted;
  await new ChangesTab(page, expect).waitForRegenerationComplete();
  await snapshot("hook saved - preview regenerated");

  // Check the updated title.
  // Verify the updated heading (sidebar is alongside the preview, iframe is already visible)
  await modal.expectPreviewIframeHeading("vulkan - Dwarkesh and Anthropic CEO in 2023");
  await addKeyFrame(hooks);
  await snapshot("verified updated page title with vulkan hook");

  void hooksBundle;

  await skipMeadowHomeStateCheck();
});
