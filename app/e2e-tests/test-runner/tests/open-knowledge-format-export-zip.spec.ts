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

import { execFileSync } from "child_process";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { customize, openKnowledgeFormat, changesTab as changesTabDoc, git } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";
import { MeadowHomeGit, seedTrackedAndLinkedFile } from "../src/run/utils/index.js";
import { installLocalExportZipMock } from "./open-knowledge-format-support.js";

const reservedIndexPageName = "index";
const rootLogPageName = "log";
const nestedLogDirectory = "t001";

test.use({
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      seedTrackedAndLinkedFile(configDir, reservedIndexPageName, "Reserved index source page.\n");
      seedTrackedAndLinkedFile(configDir, rootLogPageName, "Root OKF log.\n");
      seedTrackedAndLinkedFile(configDir, rootLogPageName, "Nested OKF log.\n", {
        directory: nestedLogDirectory,
      });
    });
  },
});

test("OKF: enable, inspect reserved rename indicator, save, and export ZIP", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
  artifactDir,
}) => {
  const okfZipPath = path.join(artifactDir, "meadow-test-site-big-okf.zip");
  await installLocalExportZipMock(page, testServer.backendPort, okfZipPath);

  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  const okf = await customizeTab.generationOptions.openOpenKnowledgeFormatSettings();
  await okf.expectAutomaticLog(rootLogPageName, "root");
  await okf.chooseGeneratedIndex();
  await snapshot("okf settings default to root log");
  await okf.save();
  await addKeyFrame(customize);
  await snapshot("okf enabled");

  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await customizeTab.generationOptions.expectOpenKnowledgeFormatRenameIndicatorVisible(2);
  await addKeyFrame(openKnowledgeFormat);
  await snapshot("okf generation complete with reserved rename indicator");

  await customizeTab.generationOptions.openOpenKnowledgeFormatRenameDetails(2);
  await expect(page.getByText("index.md").first()).toBeVisible();
  await expect(page.getByText("index-original.md").first()).toBeVisible();
  await expect(page.getByText("t001/log.md").first()).toBeVisible();
  await expect(page.getByText("t001/log-original.md").first()).toBeVisible();
  await snapshot("okf reserved rename details");
  await modal.closeOkfRenameDetails();

  await modal.clickChangesTab();
  await changesTab.expectFileInChanges("okf-download-manifest.json");
  await changesTab.expectFileInChanges("index-original.md");
  await addKeyFrame(changesTabDoc);
  await snapshot("changes include okf files");

  await modal.clickSitePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("save completed");

  const siteDir = path.join(testServer.configDir, "sites", Site.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await meadowGit.expectDirFullyCommitted(siteDir);
  await addKeyFrame(git);

  await page.getByRole("button", { name: "Local Export" }).click();
  const okfZipButton = page.getByTitle("Save OKF as ZIP file");
  await expect(okfZipButton).toBeEnabled({ timeout: 15_000 });
  await okfZipButton.click();
  await expect(page.getByText("Zip exported successfully!")).toBeVisible({ timeout: 15_000 });
  await snapshot("okf zip exported locally");

  const zipContents = execFileSync("unzip", ["-l", okfZipPath], { encoding: "utf8" });
  expect(zipContents).toContain("meadow-test-site-big/index.md");
  expect(zipContents).toContain("meadow-test-site-big/index-original.md");
  expect(zipContents).toContain("meadow-test-site-big/log.md");
  expect(zipContents).toContain("meadow-test-site-big/t001/log-original.md");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
