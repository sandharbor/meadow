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
import { SiteListPage, SiteEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { filters, callout } from "../src/scenario-docs/index.js";

test("empty solo callout appears when solo filter hides all pages", async ({ page, snapshot, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");
  await snapshot("site editor loaded");

  // Switch to list view for easier interaction
  await editor.switchToListView();
  await snapshot("list view");

  // Create a custom filter that matches no pages, then solo it
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.clickAddCustomFilter();
  await filterPanel.fillAndSaveCustomFilter({
    name: "no match",
    field: "title",
    matchType: "substring",
    value: "xyznonexistent",
  });
  await page.waitForTimeout(250);
  await snapshot("custom filter created");

  await filterPanel.enableAndSoloFilter("no match");
  await page.waitForTimeout(250);
  await snapshot("custom filter soloed with no matching pages");

  // The callout should now be visible since no pages match
  await editor.expectEmptySoloCalloutVisible();
  await addKeyFrame(callout);
  await snapshot("empty solo callout visible");

  // Click "Turn off solos" to restore the view
  await editor.clickTurnOffSolos();
  await page.waitForTimeout(250);
  await snapshot("solos turned off");

  // Callout should be gone and pages should be visible
  await editor.expectEmptySoloCalloutNotVisible();
  const pageCount = await editor.getListViewPageCount();
  expect(pageCount).toBeGreaterThan(0);
  await snapshot("pages visible again");
});
