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
import { BundleListPage, BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { multiBundle, findInBundles } from "../../../concepts/index.js";
import { bigBundle, smallBundle, exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("find in bundles navigates from small bundle to big bundle with page auto-selected", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle so the bundle list has more entries, making the
  // find-in-bundles filtering more visually obvious.
  await bundleList.goto();
  await bundleList.addExampleBundleFromMenu();
  await page.waitForTimeout(2000);
  await bundleList.goto();
  await bundleList.expectBundleVisible(Bundle.Example);
  await snapshot("bundle list with example bundle added");

  // Navigate to the small bundle
  await bundleList.clickBundle(Bundle.Small);
  await editor.waitForLoad(Bundle.Small);
  await snapshot("small bundle loaded");

  // Switch to list view and right-click the initial page "t001 - deeply nested"
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await snapshot("context menu open on t001");

  // Click "Find in Bundles" from the context menu
  await editor.clickFindInBundles();
  await page.waitForTimeout(500);

  // Should be back at bundle list with find-in-bundles filter active
  await bundleList.expectHeadingVisible();
  await bundleList.expectFindInBundlesFilterActive("t001 - deeply nested");
  await snapshot("bundle list with find in bundles filter active");

  // Both Big and Small should be visible (both track this page),
  // but the example bundle should be filtered out
  await bundleList.expectBundleVisible(Bundle.Big);
  await bundleList.expectBundleVisible(Bundle.Small);
  await bundleList.expectBundleNotVisible(Bundle.Example);
  await addKeyFrame(findInBundles);
  await addKeyFrame(multiBundle);

  // Click on the big bundle
  await bundleList.clickBundle(Bundle.Big);
  await editor.waitForLoad(Bundle.Big);
  await page.waitForTimeout(500);
  await snapshot("big bundle loaded with auto-selected page");

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
  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await assertMeadowHomeState();
});
