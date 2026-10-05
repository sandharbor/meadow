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

import { test, expect } from "../src/run/test-fixtures.js";
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { htmlGeneration, customize, changesTab as changesTabDoc } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Save a generated bundle and customize its HTML output. The section-change filter should
 * distinguish the resulting changes from the saved baseline.
 */
test("HTML section changes filter correctly reflects changes after save and customization", { annotation: { type: 'scenario-id', description: 'e5b729ec-8d8d-4a05-acad-1822d0cc963c' } }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // --- Setup ---
  // Navigate to big bundle preview (starts on step 1 — Review)
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => checkpoint("step 1 - preview loaded"));

  // --- Test start ---
  // Check the initial change count.
  await sourceCommand(() => changesTab.expectBadgeVisible());
  await sourceCommand(() => checkpoint("changes tab has positive badge"));

  // Save the generated version.
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => checkpoint("save completed - on step 2"));

  // Return to review.
  await sourceCommand(() => modal.clickStep1Review());
  await sourceCommand(() => checkpoint("back on step 1"));

  // Check that the changes are cleared.
  await sourceCommand(() => changesTab.expectNoBadge());
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("changes tab has no badge after save"));

  // Disable breadcrumbs.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  await sourceCommand(() => customizeTab.generationOptions.disableBreadcrumbs());
  await sourceCommand(() => checkpoint("breadcrumbs disabled at bundle level"));

  // Wait for the regenerated output.
  await sourceCommand(() => changesTab.waitForRegenerationComplete());

  // Changes tab indicator should show a positive number again
  await sourceCommand(() => changesTab.expectBadgeVisible());
  await sourceCommand(() => checkpoint("changes tab has badge after customization change"));

  // Inspect the modified files.
  await sourceCommand(() => modal.clickChangesTab());

  // Only modified files should be shown (no new or deleted)
  await sourceCommand(() => changesTab.expectOnlyModifiedFiles());
  await sourceCommand(() => checkpoint("only modified files in changes tab"));

  // Open the section filter.
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  await sourceCommand(() => checkpoint("html section changes filter opened"));

  // Check which section changed.
  await sourceCommand(() => changesTab.expectOnlySectionsWithChanges(["<header>"]));
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint("only header section has changes"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
