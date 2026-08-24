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
import { customize, openKnowledgeFormat } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { seedTrackedAndLinkedFile, seedTrackedFile } from "../src/run/utils/index.js";
import { OpenKnowledgeFormatBundle } from "./open-knowledge-format-support.js";

const releaseNotesPageName = "OKF custom release notes";
const orphanLogChoicePageName = "OKF orphan log choice";

test.use({ bundleMode: "single-file" });

test.use({
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      seedTrackedAndLinkedFile(configDir, releaseNotesPageName, "Custom OKF release notes.\n");
      seedTrackedFile(configDir, orphanLogChoicePageName, "This tracked page is not reachable from the main page.\n");
    });
  },
});

test("OKF: choose a custom tracked log page from the settings typeahead", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  let delayedInitialOptions = false;
  await page.route("**/generation/open-knowledge-format/log-page-options?*", async route => {
    const requestUrl = new URL(route.request().url());
    if (!delayedInitialOptions && requestUrl.searchParams.get("query") === "") {
      delayedInitialOptions = true;
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    await route.continue();
  });

  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  const okf = await customizeTab.generationOptions.openOpenKnowledgeFormatSettings();
  await okf.expectLogPageNotSuggested(orphanLogChoicePageName, "orphan");
  await okf.chooseLogPage(releaseNotesPageName);
  await addKeyFrame(customize);
  await snapshot("custom okf log page selected");
  await okf.save();

  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(openKnowledgeFormat);
  await snapshot("okf generation complete with custom log page");

  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const okfBundle = new OpenKnowledgeFormatBundle(bundleDir, expect);
  await okfBundle.expectFileToContain("log.md", "Custom OKF release notes.");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
