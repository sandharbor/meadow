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
import { customize, openKnowledgeFormat, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
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

const name = linkedScenarioName(conceptText`OKF: choose a custom tracked log page from the settings typeahead`);

const description = linkedScenarioDescription(conceptText`Choose a tracked page as the Open Knowledge Format log through the settings search.
Generate the bundle and verify that the chosen page becomes the log.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd5c7a445-f8b2-4d0a-8896-acb8452cfc86' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  // --- Setup ---
  let delayedInitialOptions = false;
  await sourceCommand(() => page.route("**/generation/open-knowledge-format/log-page-options?*", async route => {
    const requestUrl = new URL(route.request().url());
    if (!delayedInitialOptions && requestUrl.searchParams.get("query") === "") {
      delayedInitialOptions = true;
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    await route.continue();
  }));

  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  await sourceCommand(() => checkpoint("preview loaded"));

  // --- Test start ---
  // Choose a custom log page.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  const okf = await sourceCommand(() => customizeTab.generationOptions.openOpenKnowledgeFormatSettings());
  await sourceCommand(() => okf.expectLogPageNotSuggested(orphanLogChoicePageName, "orphan"));
  await sourceCommand(() => okf.chooseLogPage(releaseNotesPageName));
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("custom okf log page selected"));

  // Generate the knowledge package.
  await sourceCommand(() => okf.save());

  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => addKeyFrame(openKnowledgeFormat));
  await sourceCommand(() => checkpoint("okf generation complete with custom log page"));

  // Inspect the generated package files.
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const okfBundle = new OpenKnowledgeFormatBundle(bundleDir, expect);
  await sourceCommand(() => okfBundle.expectFileToContain("log.md", "Custom OKF release notes."));
  void bigBundle;

  await sourceCommand(() => checkpoint("the selected log becomes the package log page"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
