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
import { linkGap } from "../src/scenario-docs/index.js";

test("inlink gap filter auto-calculates threshold and selects correct pages", async ({ page, snapshot, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");
  await snapshot("site editor loaded");

  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Inlink Gap");
  await page.waitForTimeout(250);
  await snapshot("inlink gap filter enabled");

  const threshold = await filterPanel.getFilterThresholdValue("Inlink Gap");
  expect(threshold).toBe(3);
  await addKeyFrame(linkGap);
  await snapshot("inlink gap threshold is 3");

  await filterPanel.clickSoloOnFilter("Inlink Gap");
  await snapshot("inlink gap filter soloed");

  await editor.clickSelectAll();
  await snapshot("all visible pages selected");

  const titles = await editor.getSelectedPageTitles();
  expect(titles.length).toBe(1);
  await snapshot("verified one page selected with inlink gap");
});
