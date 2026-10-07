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
import { customize, sourcesExport, openKnowledgeFormat, changesTab as changesTabDoc, git, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
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

const name = linkedScenarioName(conceptText`OKF: enable, inspect reserved rename indicator, save, export ZIP, and browse bundle index`);

const description = linkedScenarioDescription(conceptText`Enable Open Knowledge Format and review its reserved-name changes. Save, export a ZIP,
and browse the resulting bundle index.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '0da48f7e-6325-4dad-879a-53665bd280c7' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  await sourceCommand(() => checkpoint("preview loaded"));

  // --- Test start ---
  // Configure sources and knowledge exports.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  await sourceCommand(() => customizeTab.generationOptions.enableSourcesExport());
  const okf = await sourceCommand(() => customizeTab.generationOptions.openOpenKnowledgeFormatSettings());
  await sourceCommand(() => okf.expectAutomaticLog(rootLogPageName, "root"));
  await sourceCommand(() => okf.chooseGeneratedIndex());
  await sourceCommand(() => checkpoint("okf settings default to root log"));

  // Save the export settings.
  await sourceCommand(() => okf.save());
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("sources zip and okf enabled"));

  // Wait for package generation.
  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => addKeyFrame(sourcesExport));
  await sourceCommand(() => customizeTab.generationOptions.expectOpenKnowledgeFormatRenameIndicatorVisible(2));
  await sourceCommand(() => addKeyFrame(openKnowledgeFormat));
  await sourceCommand(() => checkpoint("okf generation complete with reserved rename indicator"));

  // Inspect reserved-name handling.
  await sourceCommand(() => customizeTab.generationOptions.openOpenKnowledgeFormatRenameDetails(2));
  await sourceCommand(() => modal.expectOkfRenameDetails([
    "index.md",
    "index-original.md",
    "t001/log.md",
    "t001/log-original.md",
  ]));
  await sourceCommand(() => checkpoint("okf reserved rename details"));

  // Review the generated files.
  await sourceCommand(() => modal.closeOkfRenameDetails());

  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.expectFolderCollapsed("_mw_assets"));
  await sourceCommand(() => changesTab.expandFolder("_mw_assets"));
  await sourceCommand(() => changesTab.expectFileInChanges("okf-download-manifest.json"));
  await sourceCommand(() => changesTab.expectFileInChanges("index-original.md"));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint("changes include okf files"));

  // Save the generated version.
  await sourceCommand(() => modal.clickBundlePreviewTab());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => checkpoint("save completed"));

  // Open the reader download menu.
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await sourceCommand(() => meadowGit.expectDirFullyCommitted(bundleDir));
  await sourceCommand(() => addKeyFrame(git));

  await sourceCommand(() => modal.clickStep1Review());
  await sourceCommand(() => modal.clickBundlePreviewTab());
  await sourceCommand(() => generatedBundle.sources.expectControlsAligned());
  await sourceCommand(() => generatedBundle.sources.openOkfMenuWithoutShiftingPage());
  await sourceCommand(() => generatedBundle.sources.dismissOkfMenu());
  await sourceCommand(() => generatedBundle.sources.openOkfMenu());
  await sourceCommand(() => checkpoint("okf website package menu open"));

  // Download the knowledge package.
  const download = await sourceCommand(() => generatedBundle.sources.downloadOkfZip());
  expect(download.suggestedFilename()).toBe("meadow-test-bundle-big-okf.zip");
  const okfZipPath = await sourceCommand(() => download.path());
  expect(okfZipPath).toBeTruthy();
  await sourceCommand(() => checkpoint("okf zip downloaded from website button"));

  // Inspect and browse the package.
  const zipContents = execFileSync("unzip", ["-l", okfZipPath!], { encoding: "utf8" });
  expect(zipContents).toContain("meadow-test-bundle-big/index.md");
  expect(zipContents).toContain("meadow-test-bundle-big/index-original.md");
  expect(zipContents).toContain("meadow-test-bundle-big/log.md");
  expect(zipContents).toContain("meadow-test-bundle-big/t001/log-original.md");

  await sourceCommand(() => generatedBundle.sources.openOkfBundleIndex());
  await sourceCommand(() => modal.expectPreviewIframeUrlContains("_mw_assets/cust/okf/bundle/index.md"));
  await sourceCommand(() => checkpoint("okf bundle index browsed from website button"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
