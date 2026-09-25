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
import {
  BundleEditorPage,
  PreviewPublishModal,
  ChangesTab,
  FilterPanelComponent,
  SelectedPageDetailComponent,
  ActionButton,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { filters, htmlGeneration, changesTab as changesTabDoc, tracking } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Generate and save a bundle, then change its output. Check that change-type counts and
 * HTML-section filters stay consistent throughout the review.
 */
test("Change type filter shows correct counts and interacts with HTML section filter", async ({
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);

  await changesTab.expectBadgeVisible();
  await modal.clickChangesTab();
  await changesTab.expectOnlyNewFiles();
  await checkpoint("changes tab showing only new files");

  // --- Test start ---
  // Inspect the change counts.
  await changesTab.openHtmlSectionChangesFilter();
  const addedCount = await changesTab.getChangeTypeCount("Added");
  expect(addedCount).toBeGreaterThan(0);
  await changesTab.expectChangeTypeCount("Modified", 0);
  await changesTab.expectChangeTypeCount("Deleted", 0);
  await checkpoint("filter shows only added files with positive count");

  // Hide added files.
  await changesTab.uncheckChangeType("Added");
  await changesTab.expectNoVisibleHtmlSections();
  await changesTab.expectHiddenCount(addedCount);
  await addKeyFrame(filters);
  await addKeyFrame(changesTabDoc);
  await checkpoint("unchecked added - html sections hidden and hidden count matches");

  // Restore added files and save.
  await changesTab.checkChangeType("Added");

  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickStep1Review();
  await changesTab.expectNoBadge();
  await checkpoint("no badge after save");

  // Inspect the saved change counts.
  await modal.clickChangesTab();
  await changesTab.openHtmlSectionChangesFilter();
  await changesTab.expectChangeTypeCount("Added", 0);
  await changesTab.expectChangeTypeCount("Modified", 0);
  await changesTab.expectChangeTypeCount("Deleted", 0);
  await checkpoint("all change type counts zero after save");

  // Track another page.
  await modal.closeModal();

  // Solo the Untracked filter to see only untracked pages
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableAndSoloFilter("Untracked");
  await page.waitForTimeout(500);

  const editor = new BundleEditorPage(page, expect);
  await editor.switchToListView();
  await page.waitForTimeout(250);

  // Click on the "004 - sensitive" page row to select it
  await editor.clickListViewRowByName("t004 - sensitive");
  await page.waitForTimeout(250);

  // Track it via the selected page detail panel
  const selectedRoot = editor.getSelectedPageRoot();
  const selectedPage = new SelectedPageDetailComponent(selectedRoot, expect);
  // Tracking a page is a "simple op" that auto-saves + commits — no Save click needed.
  await selectedPage.clickAction(ActionButton.Track, page);
  await addKeyFrame(tracking);
  await checkpoint("tracked sensitive page");

  // Preview the new selection.
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await checkpoint("second preview after tracking new page");

  // Inspect the mixed changes.
  await modal.clickChangesTab();
  await page.waitForTimeout(500);

  // Tracking the page adds its HTML, a search shard, and a content-addressed
  // reader route index. It replaces the previous route index, and also
  // modifies the main page, search manifest, and main page's search shard.
  await changesTab.openHtmlSectionChangesFilter();
  await changesTab.expectChangeTypeCount("Added", 3);
  await changesTab.expectChangeTypeCount("Modified", 3);
  await changesTab.expectChangeTypeCount("Deleted", 1);

  // Should see 2 changes in the <main> section
  await changesTab.expectSectionCount("<main>", 2);
  await addKeyFrame(htmlGeneration);
  await checkpoint("search-aware file totals and 2 main section changes");

  // Hide modified files.
  await changesTab.uncheckChangeType("Modified");
  await page.waitForTimeout(500);
  await changesTab.expectSectionCount("<main>", 1);
  await checkpoint("unchecked modified - main section drops to 1");

  void bigBundle;

  await skipMeadowHomeStateCheck();
});
