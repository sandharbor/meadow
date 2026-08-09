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
import { customize, sourcesExport, openKnowledgeFormat, changesTab as changesTabDoc, git } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";
import { MeadowHomeGit, seedTrackedAndLinkedFile } from "../src/run/utils/index.js";

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

test("OKF: enable, inspect reserved rename indicator, save, export ZIP, and browse bundle index", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.enableSourcesExport();
  const okf = await customizeTab.generationOptions.openOpenKnowledgeFormatSettings();
  await okf.expectAutomaticLog(rootLogPageName, "root");
  await okf.chooseGeneratedIndex();
  await snapshot("okf settings default to root log");
  await okf.save();
  await addKeyFrame(customize);
  await snapshot("sources zip and okf enabled");

  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(sourcesExport);
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
  await changesTab.expectFolderCollapsed("_mw_assets");
  await changesTab.expandFolder("_mw_assets");
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

  await modal.clickStep1Review();
  await modal.clickSitePreviewTab();
  const previewFrame = page.frameLocator('iframe[title="Preview"]');
  const sourcesDownloadButton = previewFrame.locator("a.sources-export-download", { hasText: "sources" });
  const okfPackageButton = previewFrame.locator("summary.sources-export-download", { hasText: "OKF" });
  const previewHeading = previewFrame.locator("h1").first();
  await expect(sourcesDownloadButton).toBeVisible({ timeout: 15_000 });
  await expect(okfPackageButton).toBeVisible({ timeout: 15_000 });
  const sourcesButtonBox = await sourcesDownloadButton.boundingBox();
  const okfButtonBox = await okfPackageButton.boundingBox();
  expect(sourcesButtonBox).not.toBeNull();
  expect(okfButtonBox).not.toBeNull();
  expect(Math.abs(okfButtonBox!.y - sourcesButtonBox!.y)).toBeLessThan(1);
  expect(Math.abs(okfButtonBox!.height - sourcesButtonBox!.height)).toBeLessThan(1);
  const headingBoxBeforeMenuOpen = await previewHeading.boundingBox();
  expect(headingBoxBeforeMenuOpen).not.toBeNull();
  await okfPackageButton.click();
  const okfZipDownloadLink = previewFrame.getByRole("link", { name: "Download ZIP" });
  await expect(okfZipDownloadLink).toBeVisible();
  const headingBoxAfterMenuOpen = await previewHeading.boundingBox();
  expect(headingBoxAfterMenuOpen).not.toBeNull();
  expect(Math.abs(headingBoxAfterMenuOpen!.y - headingBoxBeforeMenuOpen!.y)).toBeLessThan(1);
  await previewFrame.locator("body").click({ position: { x: 8, y: 140 } });
  await expect(okfZipDownloadLink).not.toBeVisible();
  await okfPackageButton.click();
  await expect(okfZipDownloadLink).toBeVisible();
  await snapshot("okf website package menu open");

  const downloadPromise = page.waitForEvent("download");
  await okfZipDownloadLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("meadow-test-site-big-okf.zip");
  const okfZipPath = await download.path();
  expect(okfZipPath).toBeTruthy();
  await snapshot("okf zip downloaded from website button");

  const zipContents = execFileSync("unzip", ["-l", okfZipPath!], { encoding: "utf8" });
  expect(zipContents).toContain("meadow-test-site-big/index.md");
  expect(zipContents).toContain("meadow-test-site-big/index-original.md");
  expect(zipContents).toContain("meadow-test-site-big/log.md");
  expect(zipContents).toContain("meadow-test-site-big/t001/log-original.md");

  await okfPackageButton.click();
  await previewFrame.getByRole("link", { name: "Bundle index" }).click();
  await modal.expectPreviewIframeUrlContains("_mw_assets/okf/bundle/index.md");
  await snapshot("okf bundle index browsed from website button");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
