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
import type { Page } from "@playwright/test";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { MeadowHomeGit } from "../src/run/utils/index.js";
import { customize, sourcesExport, changesTab as changesTabDoc, filters, git } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

async function applyGenerationOptionAndWait(page: Page, action: () => Promise<void>) {
  const previewResponse = page.waitForResponse(response => response.url().includes("/preview-stream"));
  await action();
  await previewResponse;
}

test.use({ bundleMode: "single-file" });

test("Sources export ZIP: saved export can be disabled without hiding changed HTML", async ({
  page, snapshot, skipMeadowHomeStateCheck, addKeyFrame, testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await snapshot("preview loaded");

  // Use the wrapped generated-page layout that exposed the section-diff bug,
  // then enable Sources ZIP at bundle level.
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.enableFolderNavigation());
  await changesTab.waitForRegenerationComplete();
  await applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.enableSourcesExport());
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(customize);
  await snapshot("sources zip enabled");

  await addKeyFrame(sourcesExport);
  await snapshot("regeneration complete with sources export");

  // Save changes — commits generated files (HTML + sources ZIP) to MeadowHome
  await modal.clickBundlePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("save completed");

  // Verify the bundle directory in MeadowHome is fully committed — no untracked
  // or uncommitted files under the bundle (including build/sources_export/).
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await meadowGit.expectDirFullyCommitted(bundleDir);
  await addKeyFrame(git);
  await snapshot("bundle directory fully committed");

  // Reopen Review, disable the saved Sources ZIP setting, and inspect the
  // resulting HTML changes through the filter dropdown.
  await modal.closeModal();
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await modal.openCustomizeSidebar();
  await applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.disableSourcesExport());
  await changesTab.waitForRegenerationComplete();
  await modal.clickChangesTab();
  await changesTab.openHtmlSectionChangesFilter();

  const modifiedCount = await changesTab.getChangeTypeCount("Modified");
  expect(modifiedCount).toBeGreaterThan(0);
  await changesTab.expectChangeTypeCount("Added", 0);
  await changesTab.expectChangeTypeCount("Deleted", 2);
  await changesTab.expectChangeTypesChecked(["Added", "Modified", "Deleted"]);
  await changesTab.expectOnlySectionsWithChanges(["<header>"]);
  await changesTab.expectSectionCount("<header>", modifiedCount);
  await changesTab.expectNoHiddenFilesByFilter();
  await addKeyFrame(changesTabDoc);
  await addKeyFrame(filters);
  await snapshot("all sources zip HTML changes remain visible");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
