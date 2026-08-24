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

import fs from "fs";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { ChangesTab, CustomizeTab, PreviewPublishModal } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { versioning } from "../src/scenario-docs/index.js";
import { smallBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

test("V08 G05 generated version frozen integrity is recoverable before canceling an unsaved successor", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToSmallBundlePreview();

  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Small);
  const initialVersion = await versions.waitForOnlyVersion();

  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickStep1Review();
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.disableBreadcrumbs();
  await changesTab.waitForRegenerationComplete();
  await modal.clickChangesTab();
  await modal.openCreateNewVersionDialog();
  await modal.createConnectedVersion("Recoverable successor");
  await modal.expectVersionsTabActive();
  await modal.expectVersionCreatedMessageHidden();

  const [, successor] = await versions.waitForCount(2);
  const frozenDirectory = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Small,
    "html",
    "generated_bundle_versions",
    initialVersion.versionId,
  );
  const frozenHtmlPath = fs.readdirSync(frozenDirectory, { recursive: true, encoding: "utf8" })
    .find(relativePath => relativePath.endsWith(".html"));
  expect(frozenHtmlPath).toBeTruthy();
  const frozenHtmlFile = path.join(frozenDirectory, frozenHtmlPath!);
  fs.appendFileSync(frozenHtmlFile, "\n<!-- injected frozen edit -->\n");

  // The test changes the filesystem behind the UI's back, so remount the
  // Versions tab to trigger the same integrity refresh as returning to it.
  await modal.clickChangesTab();
  await modal.clickVersionsTab();

  await expect(page.getByText("Integrity Problem", { exact: true })).toBeVisible();
  await expect(page.getByText("Frozen version modified locally", { exact: true })).toBeVisible();
  await addKeyFrame(versioning);
  await snapshot("frozen integrity problem blocks version workflow");

  await page.getByRole("button", { name: "Restore Frozen Version from Git" }).click();
  await expect(page.getByText("Integrity Problem", { exact: true })).toHaveCount(0);
  expect(fs.readFileSync(frozenHtmlFile, "utf8")).not.toContain("injected frozen edit");

  await modal.cancelCurrentVersion();
  await expect(page.getByText(successor.versionId, { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await modal.expectSingleVersionExplanation();
  await expect(page.getByText(initialVersion.versionId, { exact: true })).toHaveCount(0);
  const restoredCurrent = await versions.waitForOnlyVersion();
  expect(restoredCurrent).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "current",
  });
  await snapshot("unsaved successor canceled after integrity recovery");

  void smallBundle;
  await skipMeadowHomeStateCheck();
});
