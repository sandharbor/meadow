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
import { htmlGeneration, customize, changesTab as changesTabDoc } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("HTML section changes filter correctly reflects changes after save and customization", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // Navigate to big site preview (starts on step 1 — Review)
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await snapshot("step 1 - preview loaded");

  // Changes tab indicator should show a positive number (initial preview has changes)
  await changesTab.expectBadgeVisible();
  await snapshot("changes tab has positive badge");

  // Click "Save Changes" — saves and auto-navigates to step 2 (Share)
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("save completed - on step 2");

  // Go back to step 1 (Review)
  await modal.clickStep1Review();
  await snapshot("back on step 1");

  // Changes tab indicator should have no number (changes were saved)
  await changesTab.expectNoBadge();
  await addKeyFrame(htmlGeneration);
  await snapshot("changes tab has no badge after save");

  // Go to Customize tab and disable breadcrumbs at site level
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.disableBreadcrumbs();
  await snapshot("breadcrumbs disabled at site level");

  // Wait for preview regeneration to complete
  await changesTab.waitForRegenerationComplete();

  // Changes tab indicator should show a positive number again
  await changesTab.expectBadgeVisible();
  await snapshot("changes tab has badge after customization change");

  // Go to changes tab
  await modal.clickChangesTab();

  // Only modified files should be shown (no new or deleted)
  await changesTab.expectOnlyModifiedFiles();
  await snapshot("only modified files in changes tab");

  // Open the HTML section changes filter
  await changesTab.openHtmlSectionChangesFilter();
  await snapshot("html section changes filter opened");

  // Only the header section should have changes (breadcrumbs are in the header)
  await changesTab.expectOnlySectionsWithChanges(["<header>"]);
  await addKeyFrame(customize);
  await addKeyFrame(changesTabDoc);
  await snapshot("only header section has changes");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
