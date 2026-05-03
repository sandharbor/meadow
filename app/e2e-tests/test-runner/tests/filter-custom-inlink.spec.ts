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
import { filters } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("filter custom inlink title substring selects expected pages", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");
  await snapshot("site editor loaded");

  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.clickAddCustomFilter();
  await snapshot("custom filter modal open");

  await filterPanel.fillAndSaveCustomFilter({
    name: "inlink in title",
    field: "title",
    matchType: "substring",
    value: "inlink",
  });
  await snapshot("custom filter saved");

  await page.waitForTimeout(250);

  await filterPanel.clickSoloOnFilter("inlink in title");
  await addKeyFrame(filters);
  await snapshot("filter soloed");

  await editor.clickSelectAll();
  await snapshot("all visible pages selected");

  const titles = await editor.getSelectedPageTitles();
  expect(titles.length).toBe(7);
  for (const title of titles) {
    expect(title.toLowerCase()).toContain("inlink");
  }
  await snapshot("verified selected page titles");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
