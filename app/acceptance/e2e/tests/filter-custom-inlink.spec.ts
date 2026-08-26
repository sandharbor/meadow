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
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { filters } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("filter custom inlink title substring selects expected pages", async ({ page, snapshot, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await snapshot("bundle list loaded");

  await bundleList.clickBundle("meadow-test-bundle-big");
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-bundle-big");
  await snapshot("bundle editor loaded");

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
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
