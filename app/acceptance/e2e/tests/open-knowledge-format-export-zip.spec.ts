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
import { Workflows, Bundle } from "../src/run/workflows.js";
import { customize, sourcesExport, openKnowledgeFormat, changesTab as changesTabDoc, git } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { MeadowHomeGit, seedTrackedAndLinkedFile } from "../src/run/utils/index.js";

const reservedIndexPageName = "index";
const rootLogPageName = "log";
const nestedLogDirectory = "t001";

test.use({ bundleMode: "single-file" });

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

/*
 * Enable Open Knowledge Format and review its reserved-name changes. Save, export a ZIP,
 * and browse the resulting bundle index.
 */
test("OKF: enable, inspect reserved rename indicator, save, export ZIP, and browse bundle index", async ({
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  await checkpoint("preview loaded");

  // --- Test start ---
  // Configure sources and knowledge exports.
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.enableSourcesExport();
  const okf = await customizeTab.generationOptions.openOpenKnowledgeFormatSettings();
  await okf.expectAutomaticLog(rootLogPageName, "root");
  await okf.chooseGeneratedIndex();
  await checkpoint("okf settings default to root log");

  // Save the export settings.
  await okf.save();
  await addKeyFrame(customize);
  await checkpoint("sources zip and okf enabled");

  // Wait for package generation.
  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(sourcesExport);
  await customizeTab.generationOptions.expectOpenKnowledgeFormatRenameIndicatorVisible(2);
  await addKeyFrame(openKnowledgeFormat);
  await checkpoint("okf generation complete with reserved rename indicator");

  // Inspect reserved-name handling.
  await customizeTab.generationOptions.openOpenKnowledgeFormatRenameDetails(2);
  await modal.expectOkfRenameDetails([
    "index.md",
    "index-original.md",
    "t001/log.md",
    "t001/log-original.md",
  ]);
  await checkpoint("okf reserved rename details");

  // Review the generated files.
  await modal.closeOkfRenameDetails();

  await modal.clickChangesTab();
  await changesTab.expectFolderCollapsed("_mw_assets");
  await changesTab.expandFolder("_mw_assets");
  await changesTab.expectFileInChanges("okf-download-manifest.json");
  await changesTab.expectFileInChanges("index-original.md");
  await addKeyFrame(changesTabDoc);
  await checkpoint("changes include okf files");

  // Save the generated version.
  await modal.clickBundlePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await checkpoint("save completed");

  // Open the reader download menu.
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await meadowGit.expectDirFullyCommitted(bundleDir);
  await addKeyFrame(git);

  await modal.clickStep1Review();
  await modal.clickBundlePreviewTab();
  await generatedBundle.sources.expectControlsAligned();
  await generatedBundle.sources.openOkfMenuWithoutShiftingPage();
  await generatedBundle.sources.dismissOkfMenu();
  await generatedBundle.sources.openOkfMenu();
  await checkpoint("okf website package menu open");

  // Download the knowledge package.
  const download = await generatedBundle.sources.downloadOkfZip();
  expect(download.suggestedFilename()).toBe("meadow-test-bundle-big-okf.zip");
  const okfZipPath = await download.path();
  expect(okfZipPath).toBeTruthy();
  await checkpoint("okf zip downloaded from website button");

  // Inspect and browse the package.
  const zipContents = execFileSync("unzip", ["-l", okfZipPath!], { encoding: "utf8" });
  expect(zipContents).toContain("meadow-test-bundle-big/index.md");
  expect(zipContents).toContain("meadow-test-bundle-big/index-original.md");
  expect(zipContents).toContain("meadow-test-bundle-big/log.md");
  expect(zipContents).toContain("meadow-test-bundle-big/t001/log-original.md");

  await generatedBundle.sources.openOkfBundleIndex();
  await modal.expectPreviewIframeUrlContains("_mw_assets/cust/okf/bundle/index.md");
  await checkpoint("okf bundle index browsed from website button");

  void bigBundle;

  await skipMeadowHomeStateCheck();
});
