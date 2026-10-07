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
import type { Page } from "@playwright/test";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { MeadowHomeGit } from "../src/run/utils/index.js";
import { customize, sourcesExport, changesTab as changesTabDoc, filters, git, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

async function applyGenerationOptionAndWait(page: Page, action: () => Promise<void>) {
  const previewResponse = page.waitForResponse(response => response.url().includes("/preview-stream"));
  await action();
  await previewResponse;
}

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sources export ZIP: saved export can be disabled without hiding changed HTML`);

const description = linkedScenarioDescription(conceptText`Enable and save a source ZIP export, then disable it. The saved export should become
unavailable while generated HTML changes remain reviewable.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '0ec721cf-af7a-4c07-8787-42294412e324' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame, testServer,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => checkpoint("preview loaded"));

  // --- Test start ---
  // Enable source export.
  // Use the wrapped generated-page layout that exposed the section-diff bug,
  // then enable Sources ZIP at bundle level.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.enableFolderNavigation()));
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.enableSourcesExport()));
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => addKeyFrame(sourcesExport));
  await sourceCommand(() => checkpoint("regeneration complete with sources export"));

  // Save the generated version.
  await sourceCommand(() => modal.clickBundlePreviewTab());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => checkpoint("save completed"));

  // Check the committed files.
  // Verify the bundle directory in MeadowHome is fully committed — no untracked
  // or uncommitted files under the bundle (including build/sources_export/).
  const bundleDir = path.join(testServer.configDir, "bundles", Bundle.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await sourceCommand(() => meadowGit.expectDirFullyCommitted(bundleDir));
  await sourceCommand(() => addKeyFrame(git));
  await sourceCommand(() => checkpoint("bundle directory fully committed"));

  // Disable source export and inspect the diff.
  // Reopen Review, disable the saved Sources ZIP setting, and inspect the
  // resulting HTML changes through the filter dropdown.
  await sourceCommand(() => modal.closeModal());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => applyGenerationOptionAndWait(page, () => customizeTab.generationOptions.disableSourcesExport()));
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());

  const modifiedCount = await sourceCommand(() => changesTab.getChangeTypeCount("Modified"));
  expect(modifiedCount).toBeGreaterThan(0);
  await sourceCommand(() => changesTab.expectChangeTypeCount("Added", 0));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 2));
  await sourceCommand(() => changesTab.expectChangeTypesChecked(["Added", "Modified", "Deleted"]));
  await sourceCommand(() => changesTab.expectOnlySectionsWithChanges(["<header>"]));
  await sourceCommand(() => changesTab.expectSectionCount("<header>", modifiedCount));
  await sourceCommand(() => changesTab.expectNoHiddenFilesByFilter());
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("all sources zip HTML changes remain visible"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
