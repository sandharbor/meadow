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
import { SiteListPage, SiteEditorPage, FilterPanelComponent, SelectedPageDetailComponent, Pill, ActionButton } from "../src/run/pages/index.js";
import { frontier } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("frontier nodes show filtered pages and respond to depth changes", async ({ page, snapshot, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");
  await snapshot("site editor loaded");

  // Enable the Frontier filter and solo it
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Frontier");
  await page.waitForTimeout(250);
  await snapshot("frontier pages shown");

  await filterPanel.clickSoloOnFilter("Frontier");
  await addKeyFrame(frontier);
  await snapshot("frontier filter soloed");

  // Switch to list view and verify 4 site pages
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const countAtDepth1 = await editor.getListViewPageCount();
  expect(countAtDepth1).toBe(8);
  await snapshot("list view with 8 frontier pages at depth 1");

  // Increase frontier depth to 2 and verify 11 site pages
  // Wait longer than the 300ms debounce in FilterPanel + API fetch time
  await filterPanel.setFilterThresholdValue("Frontier", 2);
  await page.waitForTimeout(1000);
  const countAtDepth2 = await editor.getListViewPageCount();
  expect(countAtDepth2).toBe(11);
  await snapshot("list view with 11 frontier pages at depth 2");

  // Select an untracked frontier page (deeper pages are untracked)
  await editor.clickListViewRow(10);
  await page.waitForTimeout(250);

  // Get the selected page detail card from the sidebar
  const selectedPageRoot = page.locator('[data-testid^="selected-page-"]').first();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.openDetails();
  await page.waitForTimeout(250);

  // Frontier pages should not be trackable or blacklistable
  await detail.expectButtonDisabled(ActionButton.Track);
  await detail.expectButtonDisabled(ActionButton.Blacklist);

  // Should show "Frontier" pill but not "Tracked" pill
  await detail.expectPill(Pill.Frontier);
  await detail.expectNoPill(Pill.Tracked);
  await snapshot("frontier page details with disabled track and blacklist");

  // Switch to graph view and unsolo the frontier filter
  await editor.switchToGraphView();
  await page.waitForTimeout(250);
  await filterPanel.clickSoloOnFilter("Frontier");
  await snapshot("frontier depth 2 with all nodes showing");
  void bigSite;
});
