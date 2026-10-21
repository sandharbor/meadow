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
import { scenarioSections, htmlGeneration, hooks, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleGeneration } from "../../../concepts/index.js";
import { hooksBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_hooks" });

const name = linkedScenarioName(conceptText`Hooks preview shows normalized title and editing hook updates it`);

const description = linkedScenarioDescription(conceptText`Preview a page-title hook, edit it, and preview again. The generated title should follow
the updated hook.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Navigate to bundle list and click the hooks test bundle` },
  openHooksBundle: { type: 'test', text: conceptText`Open the hooks bundle.` },
  previewBundle: { type: 'test', text: conceptText`Preview the bundle.` },
  checkHookGeneratedTitleVerifyPreviewIframe: { type: 'test', text: conceptText`Check the hook-generated title. Verify the preview iframe shows the page title normalized by the hook: "V Dwarkesh and Anthropic CEO in 2023" → "video - Dwarkesh and Anthropic CEO in 2023"` },
  openGlobalHooks: { type: 'test', text: conceptText`Open the global hooks.` },
  editPageTitleHook: { type: 'test', text: conceptText`Edit the page-title hook.` },
  changeTitleWording: { type: 'test', text: conceptText`Change the title wording.` },
  saveRegenerateSaveHookThisTriggersPreview: { type: 'test', text: conceptText`Save and regenerate. Save the hook — this triggers preview regeneration via SSE stream. Response headers mark the start of generation. The updated heading can appear while output is still staging, so also wait for regeneration to finish before teardown captures the generated files.` },
  checkUpdatedTitleVerifyUpdatedHeadingSidebar: { type: 'test', text: conceptText`Check the updated title. Verify the updated heading (sidebar is alongside the preview, iframe is already visible)` },
});
const areas = scenarioAreas([bundleGeneration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '5c38a3bb-fff1-466e-b6fe-a03358542cc4' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const { bundleList } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => checkpoint("bundle list loaded"));
    return { bundleList };
  });

  const { editor } = await test.step(sections.steps.openHooksBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle("meadow-test-bundle-for-hooks"));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForLoad("meadow-test-bundle-for-hooks"));
    await sourceCommand(() => checkpoint("bundle editor loaded - graph view, nothing untracked"));
    return { editor };
  });

  const { modal } = await test.step(sections.steps.previewBundle, async () => {
    await sourceCommand(() => editor.clickPreview());
    const modal = new PreviewPublishModal(page, expect);
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => checkpoint("preview completed"));
    return { modal };
  });

  await test.step(sections.steps.checkHookGeneratedTitleVerifyPreviewIframe, async () => {
    await sourceCommand(() => modal.expectPreviewIframeHeading("video - Dwarkesh and Anthropic CEO in 2023"));
    await sourceCommand(() => addKeyFrame(htmlGeneration));
    await sourceCommand(() => checkpoint("verified page title with video hook"));
  });

  const { customizeTab } = await test.step(sections.steps.openGlobalHooks, async () => {
    await sourceCommand(() => modal.openCustomizeSidebar());
    const customizeTab = new CustomizeTab(page, expect);
    await sourceCommand(() => customizeTab.hooks.switchScopeToGlobal());
    await sourceCommand(() => checkpoint("hooks panel in global scope"));
    return { customizeTab };
  });

  const { pageTitleHook } = await test.step(sections.steps.editPageTitleHook, async () => {
    const pageTitleHook = customizeTab.hooks.getHook("Page Title");
    await sourceCommand(() => pageTitleHook.clickEdit());
    await sourceCommand(() => checkpoint("hook editor opened"));
    return { pageTitleHook };
  });

  await test.step(sections.steps.changeTitleWording, async () => {
    await sourceCommand(() => pageTitleHook.modifyContent("'video'", "'vulkan'"));
    await sourceCommand(() => checkpoint("hook content modified"));
  });

  await test.step(sections.steps.saveRegenerateSaveHookThisTriggersPreview, async () => {
    const previewStreamStarted = page.waitForResponse(
      (resp) => resp.url().includes("/preview-stream")
    );
    await sourceCommand(() => pageTitleHook.save());
    await sourceCommand(() => previewStreamStarted);
    await sourceCommand(() => new ChangesTab(page, expect).waitForRegenerationComplete());
    await sourceCommand(() => checkpoint("hook saved - preview regenerated"));
  });

  await test.step(sections.steps.checkUpdatedTitleVerifyUpdatedHeadingSidebar, async () => {
    await sourceCommand(() => modal.expectPreviewIframeHeading("vulkan - Dwarkesh and Anthropic CEO in 2023"));
    await sourceCommand(() => addKeyFrame(hooks));
    await sourceCommand(() => checkpoint("verified updated page title with vulkan hook"));
  });

  void hooksBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
