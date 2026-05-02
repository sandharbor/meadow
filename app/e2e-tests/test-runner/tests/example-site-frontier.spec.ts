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
import { Fixture } from "../src/run/workflows.js";
import { frontier, filters } from "../src/scenario-docs/index.js";
import { exampleSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("example site frontier pages show in graph view with frontier filter", async ({
  page, snapshot, addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  // Start at empty site list and add the example site
  await siteList.goto();
  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");
  await snapshot("example site editor loaded");

  // Enable the Frontier filter (always visible in the filter panel)
  await filterPanel.enableFilter("Frontier");
  await page.waitForTimeout(500);
  await addKeyFrame(frontier);
  await snapshot("frontier filter visible");

  // Solo the frontier filter — should show frontier pages
  await filterPanel.clickSoloOnFilter("Frontier");
  await page.waitForTimeout(250);

  // Switch to list view and verify multiple frontier pages are visible
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const frontierPageCount = await editor.getListViewPageCount();
  expect(frontierPageCount).toBeGreaterThan(1);
  await addKeyFrame(filters);
  await snapshot("frontier filter soloed with multiple pages");
  void exampleSite;
});
