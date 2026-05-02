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
  SiteEditorPage,
  PreviewPublishModal,
  ChangesTab,
  FilterPanelComponent,
  SelectedPageDetailComponent,
  ActionButton,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { filters, htmlGeneration, changesTab as changesTabDoc, tracking } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Change type filter shows correct counts and interacts with HTML section filter", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  // ── Phase 1: Initial preview — only Added files ──

  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);

  await changesTab.expectBadgeVisible();
  await modal.clickChangesTab();
  await changesTab.expectOnlyNewFiles();
  await snapshot("changes tab showing only new files");

  // Open filter and verify change type counts
  await changesTab.openHtmlSectionChangesFilter();
  const addedCountEl = page.locator("label").filter({ hasText: "Added" }).locator("span.tabular-nums");
  const addedCountText = await addedCountEl.textContent();
  const addedCount = Number(addedCountText);
  expect(addedCount).toBeGreaterThan(0);
  await changesTab.expectChangeTypeCount("Modified", 0);
  await changesTab.expectChangeTypeCount("Deleted", 0);
  await snapshot("filter shows only added files with positive count");

  // Uncheck Added — HTML sections should disappear
  await changesTab.uncheckChangeType("Added");
  await changesTab.expectNoVisibleHtmlSections();
  await changesTab.expectHiddenCount(addedCount);
  await addKeyFrame(filters);
  await addKeyFrame(changesTabDoc);
  await snapshot("unchecked added - html sections hidden and hidden count matches");

  // Re-check Added to restore state before saving
  const addedCheckbox = page.locator("label").filter({ hasText: "Added" }).locator('input[type="checkbox"]');
  await addedCheckbox.check();

  // ── Phase 2: Save and verify zero counts ──

  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickStep1Review();
  await changesTab.expectNoBadge();
  await snapshot("no badge after save");

  // Go to changes tab and open filter — all counts should be 0
  await modal.clickChangesTab();
  await changesTab.openHtmlSectionChangesFilter();
  await changesTab.expectChangeTypeCount("Added", 0);
  await changesTab.expectChangeTypeCount("Modified", 0);
  await changesTab.expectChangeTypeCount("Deleted", 0);
  await snapshot("all change type counts zero after save");

  // ── Phase 3: Track an untracked page and preview again ──

  await modal.closeModal();

  // Solo the Untracked filter to see only untracked pages
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableAndSoloFilter("Untracked");
  await page.waitForTimeout(500);

  const editor = new SiteEditorPage(page, expect);
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
  await snapshot("tracked sensitive page");

  // Preview again
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await snapshot("second preview after tracking new page");

  // ── Phase 4: Verify mixed change types and HTML section interaction ──

  await modal.clickChangesTab();
  await page.waitForTimeout(500);

  // Open filter — should see 1 added and 1 modified
  await changesTab.openHtmlSectionChangesFilter();
  await changesTab.expectChangeTypeCount("Added", 1);
  await changesTab.expectChangeTypeCount("Modified", 1);

  // Should see 2 changes in the <main> section
  await changesTab.expectSectionCount("<main>", 2);
  await addKeyFrame(htmlGeneration);
  await snapshot("1 added 1 modified and 2 main section changes");

  // Uncheck Modified — main section should drop to 1
  await changesTab.uncheckChangeType("Modified");
  await page.waitForTimeout(500);
  await changesTab.expectSectionCount("<main>", 1);
  await snapshot("unchecked modified - main section drops to 1");
  void bigSite;
});
