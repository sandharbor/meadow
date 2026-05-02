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
import { bigSite } from "../src/site-docs/index.js";

test("navigate from site list to site and see graph view", async ({ page, snapshot }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");

  const graphViewButton = page.locator("button", { hasText: "Graph View" });
  await expect(graphViewButton).toHaveClass(/border-main-500/);
  await snapshot("graph view visible");
  void bigSite;
});
