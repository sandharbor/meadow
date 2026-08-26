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
import { test, expect } from "../src/run/test-fixtures.js";
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { customize, openKnowledgeFormat } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { seedTrackedAndLinkedFile, seedTrackedFile } from "../src/run/utils/index.js";
import { OpenKnowledgeFormatBundle } from "./open-knowledge-format-support.js";

const sourceIndexPageName = "index";
const chosenLogPageName = "OKF chosen log substitute";
const orphanLogSubstitutePageName = "OKF orphan log substitute";

test.use({ bundleMode: "single-file" });

test.use({
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      seedTrackedAndLinkedFile(configDir, sourceIndexPageName, "Auto OKF index source page.\n");
      seedTrackedAndLinkedFile(configDir, chosenLogPageName, "Chosen OKF log substitute.\n");
      seedTrackedFile(configDir, orphanLogSubstitutePageName, "This tracked page is not reachable from the main page.\n");
    });
  },
});

test("OKF: auto-detect index.md and choose a tracked non-log page as log.md", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  const okf = await customizeTab.generationOptions.openOpenKnowledgeFormatSettings();
  await okf.expectSelectedIndex(sourceIndexPageName, "root");
  await okf.expectNoReachableLogPageFound();
  await okf.expectLogPageNotSuggested(orphanLogSubstitutePageName, "orphan");
  await okf.chooseLogPage(chosenLogPageName);
  await addKeyFrame(customize);
  await snapshot("auto index and custom log selected");
  await okf.save();

  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(openKnowledgeFormat);
  await snapshot("okf generation complete with auto index and custom log");

  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const okfBundle = new OpenKnowledgeFormatBundle(bundleDir, expect);
  await okfBundle.expectFileToContain("index.md", "Auto OKF index source page.");
  await okfBundle.expectFileToContain("log.md", "Chosen OKF log substitute.");
  okfBundle.expectFileToBeAbsent("index-original.md");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
