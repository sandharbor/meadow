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
import { Fixture } from "../src/run/workflows.js";
import { initialPage } from "../src/scenario-docs/index.js";
import { exampleSite, exampleSiteInitialPageTitle } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("a publisher should not be able to untrack the initial page", async ({
  page, snapshot, assertMeadowHomeState, addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);

  // Add the example site and switch to list view
  await siteList.goto();
  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");
  await editor.switchToListView();
  await page.waitForTimeout(250);

  // Right-click the initial page — Untrack should be visible but disabled
  await editor.rightClickRow(exampleSiteInitialPageTitle);
  await editor.expectContextMenuItemDisabled("Untrack");
  await addKeyFrame(initialPage);
  await snapshot("initial page untrack is grayed out");

  // Close the menu by pressing Escape
  await page.keyboard.press("Escape");

  // Right-click a non-initial tracked page — Untrack should be enabled
  await editor.rightClickRow("Cognitive Biases");
  await editor.expectContextMenuItemEnabled("Untrack");
  await snapshot("non-initial page untrack is enabled");

  void exampleSite;

  await assertMeadowHomeState();
});
