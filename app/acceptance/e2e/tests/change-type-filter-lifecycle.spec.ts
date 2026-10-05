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
test("Change type filter shows correct counts and interacts with HTML section filter", { annotation: { type: 'scenario-id', description: 'e141c6a7-5f95-4f01-a45c-05bd2c17322f' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);

  await sourceCommand(() => changesTab.expectBadgeVisible());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.expectOnlyNewFiles());
  await sourceCommand(() => checkpoint("changes tab showing only new files"));

  // --- Test start ---
  // Inspect the change counts.
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  const addedCount = await sourceCommand(() => changesTab.getChangeTypeCount("Added"));
  expect(addedCount).toBeGreaterThan(0);
  await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 0));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 0));
  await sourceCommand(() => checkpoint("filter shows only added files with positive count"));

  // Hide added files.
  await sourceCommand(() => changesTab.uncheckChangeType("Added"));
  await sourceCommand(() => changesTab.expectNoVisibleHtmlSections());
  await sourceCommand(() => changesTab.expectHiddenCount(addedCount));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint("unchecked added - html sections hidden and hidden count matches"));

  // Restore added files and save.
  await sourceCommand(() => changesTab.checkChangeType("Added"));

  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.clickStep1Review());
  await sourceCommand(() => changesTab.expectNoBadge());
  await sourceCommand(() => checkpoint("no badge after save"));

  // Inspect the saved change counts.
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  await sourceCommand(() => changesTab.expectChangeTypeCount("Added", 0));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 0));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 0));
  await sourceCommand(() => checkpoint("all change type counts zero after save"));

  // Track another page.
  await sourceCommand(() => modal.closeModal());

  // Solo the Untracked filter to see only untracked pages
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.enableAndSoloFilter("Untracked"));
  await sourceCommand(() => page.waitForTimeout(500));

  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  // Click on the "004 - sensitive" page row to select it
  await sourceCommand(() => editor.clickListViewRowByName("t004 - sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));

  // Track it via the selected page detail panel
  const selectedRoot = editor.getSelectedPageRoot();
  const selectedPage = new SelectedPageDetailComponent(selectedRoot, expect);
  // Tracking a page is a "simple op" that auto-saves + commits — no Save click needed.
  await sourceCommand(() => selectedPage.clickAction(ActionButton.Track, page));
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("tracked sensitive page"));

  // Preview the new selection.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => checkpoint("second preview after tracking new page"));

  // Inspect the mixed changes.
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => page.waitForTimeout(500));

  // Tracking the page adds its HTML, a search shard, and a content-addressed
  // reader route index. It replaces the previous route index, and also
  // modifies the main page, search manifest, and main page's search shard.
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  await sourceCommand(() => changesTab.expectChangeTypeCount("Added", 3));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 3));
  await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 1));

  // Should see 2 changes in the <main> section
  await sourceCommand(() => changesTab.expectSectionCount("<main>", 2));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("search-aware file totals and 2 main section changes"));

  // Hide modified files.
  await sourceCommand(() => changesTab.uncheckChangeType("Modified"));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => changesTab.expectSectionCount("<main>", 1));
  await sourceCommand(() => checkpoint("unchecked modified - main section drops to 1"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
