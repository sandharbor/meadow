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
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { hooks, customize } from "../src/scenario-docs/index.js";

test("HTML post-processing hook: create, validate, save, and verify diff", async ({ page, snapshot, addKeyFrame }) => {
  // Navigate to big site preview
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await snapshot("preview loaded");

  // Save baseline so changes tab is clean
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("baseline saved");

  // Go back to Review, then to Customize tab
  await modal.clickStep1Review();
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await snapshot("customize tab open");

  // Create the HTML post-processing hook (opens floating editor with default template)
  const htmlHook = customizeTab.hooks.getHook("HTML");
  await htmlHook.clickCreate();
  await snapshot("hook editor opened with template");

  // Verify no changes badge before save
  await changesTab.expectNoBadge();

  // Save the hook (triggers preview regeneration), then close the floating editor
  await htmlHook.save();
  await htmlHook.close();
  await changesTab.waitForRegenerationComplete();
  await snapshot("hook saved and regeneration complete");

  // Verify changes badge appeared
  await changesTab.expectBadgeVisible();

  // Go to Changes tab and inspect the diff
  await modal.clickChangesTab();
  await changesTab.clickFirstHtmlFile();
  await changesTab.fileDetails.ensureOnDiffTab();
  await changesTab.fileDetails.clickCodeSubTab();
  await changesTab.fileDetails.expectDiffContainsText("Hello from Meadow");
  await addKeyFrame(hooks);
  await addKeyFrame(customize);
  await snapshot("diff shows Hello from Meadow");
});
