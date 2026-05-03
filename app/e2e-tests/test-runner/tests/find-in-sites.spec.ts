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
import { SiteListPage, SiteEditorPage } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { multiSite, findInSites } from "../src/scenario-docs/index.js";
import { bigSite, smallSite, exampleSite } from "../src/site-docs/index.js";

test("find in sites navigates from small site to big site with page auto-selected", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);

  // Add the example site so the site list has more entries, making the
  // find-in-sites filtering more visually obvious.
  await siteList.goto();
  await siteList.addExampleSiteFromMenu();
  await page.waitForTimeout(2000);
  await siteList.goto();
  await siteList.expectSiteVisible(Site.Example);
  await snapshot("site list with example site added");

  // Navigate to the small site
  await siteList.clickSite(Site.Small);
  await editor.waitForLoad(Site.Small);
  await snapshot("small site loaded");

  // Switch to list view and right-click the initial page "t001 - deeply nested"
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await snapshot("context menu open on t001");

  // Click "Find in Sites" from the context menu
  await editor.clickFindInSites();
  await page.waitForTimeout(500);

  // Should be back at site list with find-in-sites filter active
  await siteList.expectHeadingVisible();
  await siteList.expectFindInSitesFilterActive("t001 - deeply nested");
  await snapshot("site list with find in sites filter active");

  // Both Big and Small should be visible (both track this page),
  // but the example site should be filtered out
  await siteList.expectSiteVisible(Site.Big);
  await siteList.expectSiteVisible(Site.Small);
  await siteList.expectSiteNotVisible(Site.Example);
  await addKeyFrame(findInSites);
  await addKeyFrame(multiSite);

  // Click on the big site
  await siteList.clickSite(Site.Big);
  await editor.waitForLoad(Site.Big);
  await page.waitForTimeout(500);
  await snapshot("big site loaded with auto-selected page");

  // The page "t001 - deeply nested" should be auto-selected
  const selectedTitles = await editor.getSelectedPageTitles();
  expect(selectedTitles).toContain("t001 - deeply nested");

  // Solo the selected pages to isolate the found page
  await editor.clickSoloSelection();
  await page.waitForTimeout(250);
  await snapshot("solo mode with found page");

  // Switch to list view and verify only the auto-selected page is visible
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const listCount = await editor.getListViewPageCount();
  expect(listCount).toBe(1);
  await snapshot("list view showing only the found page");
  void bigSite;
  void smallSite;
  void exampleSite;

  await assertMeadowHomeState();
});
