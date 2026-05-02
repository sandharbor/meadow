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
import { findInSites, archived, multiSite } from "../src/scenario-docs/index.js";
import { bigSite, smallSite, exampleSite } from "../src/site-docs/index.js";

test("find in sites shows archived match indicator and archived tab", async ({
  page,
  snapshot,
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

  // Archive the big site
  await siteList.archiveSite(Site.Big);
  await page.waitForTimeout(500);
  await siteList.expectSiteNotVisible(Site.Big);
  await snapshot("big site archived");

  // Navigate to the small site
  await siteList.clickSite(Site.Small);
  await editor.waitForLoad(Site.Small);

  // Switch to list view and right-click "t001 - deeply nested"
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");

  // Click "Find in Sites" from the context menu
  await editor.clickFindInSites();
  await page.waitForTimeout(500);

  // Should be back at site list with find-in-sites filter active
  await siteList.expectHeadingVisible();
  await siteList.expectFindInSitesFilterActive("t001 - deeply nested");

  // Only the small site should be in the main (current) list —
  // the example site is filtered out because it doesn't track this page
  await siteList.expectSiteVisible(Site.Small);
  await siteList.expectSiteNotVisible(Site.Big);
  await siteList.expectSiteNotVisible(Site.Example);
  await addKeyFrame(findInSites);
  await addKeyFrame(multiSite);
  await snapshot("current tab shows only small site");

  // The archived tab should show a badge indicating 1 match
  await siteList.expectArchivedTabBadge(1);
  await snapshot("archived tab badge shows 1 match");

  // Click on the archived tab — big site should be visible there
  await siteList.clickArchivedTab();
  await page.waitForTimeout(250);
  await siteList.expectSiteVisible(Site.Big);
  await addKeyFrame(archived);
  await snapshot("archived tab shows big site match");
  void bigSite;
  void smallSite;
  void exampleSite;
});
