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
import { filters, overrides, initialPage } from "../src/scenario-docs/index.js";
import { exampleSite, exampleSiteInitialPageTitle } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("overrides filter on example site does not include the initial page", async ({
  page, snapshot, assertMeadowHomeState, addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  // Add the example site from the empty state
  await siteList.goto();
  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");
  await snapshot("example site loaded");

  // Enable the Overrides filter
  await filterPanel.enableFilter("Depth Override");
  await addKeyFrame(filters);
  await snapshot("overrides filter enabled");

  // Solo the Overrides filter so only override pages are visible
  await filterPanel.clickSoloOnFilter("Depth Override");
  await page.waitForTimeout(250);

  // Switch to list view to inspect which pages are shown
  await editor.switchToListView();
  await page.waitForTimeout(250);

  // There should be at least one override page (e.g. "Cognitive Biases")
  const overrideCount = await editor.getListViewPageCount();
  expect(overrideCount).toBeGreaterThan(0);

  // The initial page must NOT appear — its depth setting is not an override
  await editor.expectListViewRowByExactNameNotPresent(exampleSiteInitialPageTitle);
  await addKeyFrame(overrides);
  await addKeyFrame(initialPage);
  await snapshot("overrides soloed without initial page");

  void exampleSite;

  await assertMeadowHomeState();
});
