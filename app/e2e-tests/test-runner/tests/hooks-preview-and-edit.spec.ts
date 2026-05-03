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
import { SiteListPage, SiteEditorPage, PreviewPublishModal, CustomizeTab } from "../src/run/pages/index.js";
import { htmlGeneration, hooks } from "../src/scenario-docs/index.js";
import { hooksSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: "home_fixture_hooks" });

test("Hooks preview shows normalized title and editing hook updates it", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // Navigate to site list and click the hooks test site
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-for-hooks");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-for-hooks");
  await snapshot("site editor loaded - graph view, nothing untracked");

  // Click Preview and wait for it to complete
  await editor.clickPreview();
  const modal = new PreviewPublishModal(page, expect);
  await modal.waitForPreviewCompleteAllTracked();
  await snapshot("preview completed");

  // Verify the preview iframe shows the page title normalized by the hook:
  // "V Dwarkesh and Anthropic CEO in 2023" → "video - Dwarkesh and Anthropic CEO in 2023"
  await modal.expectPreviewIframeHeading("video - Dwarkesh and Anthropic CEO in 2023");
  await addKeyFrame(htmlGeneration);
  await snapshot("verified page title with video hook");

  // Open Customize sidebar, scroll to Hooks, switch to Global scope
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.hooks.switchScopeToGlobal();
  await snapshot("hooks panel in global scope");

  // Edit the global Page Title hook
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await pageTitleHook.clickEdit();
  await snapshot("hook editor opened");

  // Modify the hook: change 'video' to 'vulkan'
  await pageTitleHook.modifyContent("'video'", "'vulkan'");
  await snapshot("hook content modified");

  // Save the hook — this triggers preview regeneration via SSE stream.
  // Wait for the preview-stream EventSource response to arrive so that
  // the new preview content is fully generated before the iframe reloads,
  // avoiding transient 404s from the old iframe fetching replaced resources.
  const previewStreamDone = page.waitForResponse(
    (resp) => resp.url().includes("/preview-stream")
  );
  await pageTitleHook.save();
  await previewStreamDone;
  await snapshot("hook saved - preview regenerated");

  // Verify the updated heading (sidebar is alongside the preview, iframe is already visible)
  await modal.expectPreviewIframeHeading("vulkan - Dwarkesh and Anthropic CEO in 2023");
  await addKeyFrame(hooks);
  await snapshot("verified updated page title with vulkan hook");
  void hooksSite;

  await skipMeadowHomeStateCheck();
});
