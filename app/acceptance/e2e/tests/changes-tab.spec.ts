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
import { PreviewPublishModal, ChangesTab } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { htmlGeneration, changesTab as changesTabDoc, versioning } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

test("V03 first generated version is reviewable before and after save", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // Navigate to big bundle preview (starts on step 1 — Review)
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Big);
  await snapshot("step 1 - preview loaded");
  await modal.expectSaveChangesVisible();
  await modal.expectCreateNewVersionHidden();

  const initialVersion = await versions.waitForOnlyVersion();
  const versionId = initialVersion.versionId;
  expect(versionId).toMatch(/^v[A-Za-z0-9]{6}$/);
  expect(initialVersion).toMatchObject({ displayState: "unsaved", savedGenerationId: null });

  await modal.clickVersionsTab();
  await modal.expectSaveChangesHidden();
  await modal.expectCreateNewVersionVisible();
  await modal.expectSingleVersionExplanation();
  await expect(page.getByText(versionId, { exact: true })).toHaveCount(0);
  await addKeyFrame(versioning);
  await snapshot("first generated version shown as unsaved");
  await modal.clickChangesTab();
  await modal.expectSaveChangesVisible();
  await modal.expectCreateNewVersionHidden();

  // Changes tab badge should show a positive number (initial preview has new files)
  await changesTab.expectBadgeVisible();

  // Go to Changes tab — assert only new files (A indicators, no M or D)
  await modal.clickChangesTab();
  await changesTab.expectOnlyNewFiles();
  await changesTab.expectFolderCollapsed("_mw_assets");
  await changesTab.expandFolder("_mw_assets");
  await changesTab.expectFolderCollapsed("index");
  await changesTab.expectSelectedFile("t001 ---- child 2.html");
  await snapshot("only new files in changes tab");

  // In file details viewer: ensure on diff tab, select code sub-tab, assert "New file:"
  await changesTab.fileDetails.ensureOnDiffTab();
  await changesTab.fileDetails.clickCodeSubTab();
  await changesTab.fileDetails.expectNewFileHeader();
  await addKeyFrame(htmlGeneration);
  await addKeyFrame(changesTabDoc);
  await snapshot("new file diff header shown");

  // Click "Save Changes" — saves and auto-navigates to step 2 (Share)
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.expectShareVersionSelectorHidden();
  await snapshot("save completed - on step 2");

  // Go back to step 1 (Review)
  await modal.clickStep1Review();
  await snapshot("back on step 1 after save");

  // Changes tab badge should have no number (changes were saved)
  await changesTab.expectNoBadge();

  await modal.clickVersionsTab();
  await modal.expectSingleVersionExplanation();
  await expect(page.getByText(versionId, { exact: true })).toHaveCount(0);
  const hooksReloaded = page.waitForResponse(response =>
    response.request().method() === "GET"
      && new URL(response.url()).pathname.endsWith(
        "/api/bundles/meadow-test-bundle-big/generation/hooks",
      ),
  );
  await modal.clickChangesTab();

  // Go to Changes tab — assert "No changed files"
  await changesTab.expectNoChangedFiles();
  expect((await hooksReloaded).ok()).toBe(true);
  await snapshot("no changed files after save");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
