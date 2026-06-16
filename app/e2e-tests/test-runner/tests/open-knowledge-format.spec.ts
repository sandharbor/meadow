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
import fs from "fs";
import os from "os";
import path from "path";
import YAML from "yaml";
import { test, expect } from "../src/run/test-fixtures.js";
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { customize, openKnowledgeFormat, changesTab as changesTabDoc, git } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";
import { MeadowHomeGit } from "../src/run/utils/index.js";

interface SitePageConfigYaml {
  pages?: Array<{
    fileType?: string;
    inlinksDepth?: number;
    listType: "blacklist" | "whitelist";
    outlinksDepth?: number;
    sourceGraphSubdirectory?: string;
    title: string;
    tracked?: boolean;
  }>;
}

function seedOkfReservedPages(configDir: string): void {
  const siteDir = path.join(configDir, "sites", Site.Big);
  const siteConfigPath = path.join(siteDir, "conf", "site_config.yaml");
  const sitePageConfigPath = path.join(siteDir, "conf", "site_page_config.yaml");
  const siteConfig = YAML.parse(fs.readFileSync(siteConfigPath, "utf8")) as Record<string, unknown>;
  const originalSourceDirectory = String(siteConfig.sourceDirectory || "");
  const sourceGraphCopy = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-okf-source-graph-"));

  fs.cpSync(originalSourceDirectory, sourceGraphCopy, {
    recursive: true,
    filter: (src) => !src.includes(".DS_Store"),
  });
  siteConfig.sourceDirectory = sourceGraphCopy;
  fs.writeFileSync(siteConfigPath, YAML.stringify(siteConfig), "utf8");

  fs.appendFileSync(
    path.join(sourceGraphCopy, "main page.md"),
    [
      "",
      "",
      "OKF reserved file checks:",
      "",
      "[[index]]",
      "[[log]]",
      "[[t001/log]]",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(sourceGraphCopy, "index.md"), "Reserved index source page.\n", "utf8");
  fs.writeFileSync(path.join(sourceGraphCopy, "log.md"), "Root OKF log.\n", "utf8");
  fs.mkdirSync(path.join(sourceGraphCopy, "t001"), { recursive: true });
  fs.writeFileSync(path.join(sourceGraphCopy, "t001", "log.md"), "Nested OKF log.\n", "utf8");

  const sitePageConfig = YAML.parse(fs.readFileSync(sitePageConfigPath, "utf8")) as SitePageConfigYaml;
  const pages = Array.isArray(sitePageConfig.pages) ? sitePageConfig.pages : [];
  const ensurePage = (title: string, sourceGraphSubdirectory = "") => {
    const exists = pages.some((page) =>
      page.title === title &&
      (page.sourceGraphSubdirectory || "") === sourceGraphSubdirectory &&
      (page.fileType || "md") === "md"
    );
    if (!exists) {
      pages.push({
        fileType: "md",
        listType: "whitelist",
        sourceGraphSubdirectory,
        title,
        tracked: true,
      });
    }
  };

  ensurePage("index");
  ensurePage("log");
  ensurePage("log", "t001");
  fs.writeFileSync(sitePageConfigPath, YAML.stringify({ ...sitePageConfig, pages }), "utf8");
}

test.use({
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      seedOkfReservedPages(configDir);
    });
  },
});

test("OKF: enable, inspect reserved rename warning, save, and export ZIP", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
  artifactDir,
}) => {
  const okfZipPath = path.join(artifactDir, "meadow-test-site-big-okf.zip");
  await page.addInitScript(({ backendPort, zipPath }) => {
    const target = window as unknown as { electronAPI?: Record<string, unknown> };
    target.electronAPI = {
      ...(target.electronAPI || {}),
      getBackendPort: async () => backendPort,
      getFrontendPort: async () => 0,
      getTargetPageInfo: async () => null,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: false, filePath: zipPath }),
      openExternal: async () => undefined,
      openPath: async () => "",
      windowMinimize: async () => undefined,
      windowMaximize: async () => undefined,
      windowClose: async () => undefined,
      checkForUpdate: async () => undefined,
      downloadUpdate: async () => undefined,
      installUpdate: async () => undefined,
      getAppVersion: async () => "test",
      getUpdateState: async () => ({}),
      onUpdateStatus: () => undefined,
      offUpdateStatus: () => undefined,
      onOpenUpdateModal: () => undefined,
      offOpenUpdateModal: () => undefined,
    };
  }, { backendPort: testServer.backendPort, zipPath: okfZipPath });

  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.enableOpenKnowledgeFormat();
  await addKeyFrame(customize);
  await snapshot("okf enabled");

  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await modal.expectOkfRenameWarningVisible();
  await addKeyFrame(openKnowledgeFormat);
  await snapshot("okf generation complete with reserved rename warning");

  await modal.openOkfRenameDetails();
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
