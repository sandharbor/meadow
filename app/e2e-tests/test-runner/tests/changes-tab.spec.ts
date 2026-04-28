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

test("Changes tab lifecycle: new files, save, modify via config, verify diff headers", async ({ page, snapshot, addKeyFrame }) => {
  // Navigate to big site preview (starts on step 1 — Review)
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await snapshot("step 1 - preview loaded");

  // Changes tab badge should show a positive number (initial preview has new files)
  await changesTab.expectBadgeVisible();

  // Go to Changes tab — assert only new files (A indicators, no M or D)
  await modal.clickChangesTab();
  await changesTab.expectOnlyNewFiles();
  await snapshot("only new files in changes tab");

  // Click the first HTML file
  await changesTab.clickFirstHtmlFile();

  // In file details viewer: ensure on diff tab, select code sub-tab, assert "New file:"
  await changesTab.fileDetails.ensureOnDiffTab();
  await changesTab.fileDetails.clickCodeSubTab();
  await changesTab.fileDetails.expectNewFileHeader();
  await addKeyFrame(htmlGeneration);
  await addKeyFrame(changesTabDoc);
  await snapshot("new file diff header shown");

  // Go back to step 1 (Site Preview tab) to click Save Changes
  await modal.clickSitePreviewTab();

  // Click "Save Changes" — saves and auto-navigates to step 2 (Share)
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("save completed - on step 2");

  // Go back to step 1 (Review)
  await modal.clickStep1Review();
  await snapshot("back on step 1 after save");

  // Changes tab badge should have no number (changes were saved)
  await changesTab.expectNoBadge();

  // Go to Changes tab — assert "No changed files"
  await modal.clickChangesTab();
  await changesTab.expectNoChangedFiles();
  await snapshot("no changed files after save");

  // Go to Customize tab and disable backlinks at site level
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.disableBreadcrumbs();
  await snapshot("breadcrumbs disabled at site level");

  // Wait for preview regeneration to complete
  await changesTab.waitForRegenerationComplete();

  // Changes tab badge should show a positive number again
  await changesTab.expectBadgeVisible();
  await snapshot("changes tab has badge after config change");

  // Go to Changes tab — assert only modified files (M, no A or D)
  await modal.clickChangesTab();
  await changesTab.expectOnlyModifiedFiles();
  await snapshot("only modified files after config change");

  // Click the first HTML file
  await changesTab.clickFirstHtmlFile();

  // In file details viewer: ensure on diff tab, select code sub-tab
  await changesTab.fileDetails.ensureOnDiffTab();
  await changesTab.fileDetails.clickCodeSubTab();

  // Assert "Changes:" text (NOT "New file:") — this verifies the bug fix
  await changesTab.fileDetails.expectChangesHeader();
  await addKeyFrame(customize);
  await snapshot("changes diff header shown for modified file");
});
