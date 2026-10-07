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
import { seedTrackedAndLinkedFile } from "../src/run/utils/index.js";
import { OpenKnowledgeFormatBundle } from "./open-knowledge-format-support.js";

const sourceIndexPageName = "index";

test.use({ bundleMode: "single-file" });

test.use({
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      seedTrackedAndLinkedFile(configDir, sourceIndexPageName, "Reserved index source page.\n");
    });
  },
});

const name = linkedScenarioName(conceptText`OKF: auto-detect a source index page without reserved rename`);

const description = linkedScenarioDescription(conceptText`Enable Open Knowledge Format with an existing source index page. Meadow should use it
directly without treating it as a reserved-name rename.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'faf07c58-2ffa-4c39-9942-d575c41bb4cc' }, name.annotation, description.annotation] }, async ({ sourceCommand,
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
  await sourceCommand(() => checkpoint("preview loaded"));

  // --- Test start ---
  // Enable automatic index detection.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  const okf = await sourceCommand(() => customizeTab.generationOptions.openOpenKnowledgeFormatSettings());
  await sourceCommand(() => okf.expectSelectedIndex(sourceIndexPageName, "root"));
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("auto okf index page selected"));

  // Generate the knowledge package.
  await sourceCommand(() => okf.save());

  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => addKeyFrame(openKnowledgeFormat));
  await sourceCommand(() => checkpoint("okf generation complete with source index page"));

  // Inspect the generated package files.
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const okfBundle = new OpenKnowledgeFormatBundle(bundleDir, expect);
  await sourceCommand(() => okfBundle.expectFileToContain("index.md", "Reserved index source page."));
  okfBundle.expectFileToBeAbsent("index-original.md");
  void bigBundle;

  await sourceCommand(() => checkpoint("the source index becomes the package entry page"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
