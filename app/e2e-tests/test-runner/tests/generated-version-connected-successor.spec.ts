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
import { ChangesTab, CustomizeTab, PreviewPublishModal } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { changesTab as changesTabDoc, customize, versioning } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

test("V06 generated version connected successor freezes its predecessor and supports comparison", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundlePreview();

  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Big);
  const initialVersion = await versions.waitForOnlyVersion();

  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickStep1Review();

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.disableBreadcrumbs();
  await snapshot("breadcrumbs disabled for successor");

  await changesTab.waitForRegenerationComplete();
  await changesTab.expectBadgeVisible();
  await modal.clickChangesTab();
  await changesTab.expectOnlyModifiedFiles();
  await changesTab.clickFirstHtmlFile();
  await changesTab.fileDetails.ensureOnDiffTab();
  await changesTab.fileDetails.clickCodeSubTab();
  await changesTab.fileDetails.expectChangesHeader();
  await addKeyFrame(customize);
  await addKeyFrame(changesTabDoc);
  await snapshot("pending successor contains modified files");

  await modal.openCreateNewVersionDialog();
  await modal.createConnectedVersion("Breadcrumb-free reader version");
  await modal.expectVersionsTabActive();
  await modal.expectVersionCreatedMessageHidden();

  const [predecessor, successor] = await versions.waitForCount(2);
  expect(predecessor).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "frozen",
  });
  expect(successor).toMatchObject({
    displayState: "unsaved",
    notes: "Breadcrumb-free reader version",
  });

  await modal.clickVersionsTab();
  await expect(page.getByText("Frozen", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect(page.getByText("Breadcrumb-free reader version", { exact: true })).toBeVisible();
  await modal.expectVersionCardsNewestFirst(successor.versionId, predecessor.versionId);
  await expect(page.getByRole("heading", { name: "Compare generated files" })).toBeVisible();
  await expect(page.getByText("modified", { exact: true }).first()).toBeVisible();
  await addKeyFrame(versioning);
  await snapshot("connected successor created and compared");

  await modal.clickChangesTab();
  await changesTab.expectOnlyNewFiles();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.expectShareVersionSelected(successor.versionId, "v2");
  await modal.expectShareVersionOptionsNewestFirst(successor.versionId, predecessor.versionId);
  await addKeyFrame(versioning);
  await snapshot("share defaults to the latest casual version name and creation date");

  void bigBundle;
  await skipMeadowHomeStateCheck();
});
