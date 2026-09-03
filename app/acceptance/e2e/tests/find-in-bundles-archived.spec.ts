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
import { findInBundles, archived, multiBundle } from "../../../concepts/index.js";
import { bigBundle, smallBundle, exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("find in bundles shows archived match indicator and archived tab", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
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

  // Archive the big bundle
  await bundleList.archiveBundle(Bundle.Big);
  await page.waitForTimeout(500);
  await bundleList.expectBundleNotVisible(Bundle.Big);
  await snapshot("big bundle archived");

  // Navigate to the small bundle
  await bundleList.clickBundle(Bundle.Small);
  await editor.waitForLoad(Bundle.Small);

  // Switch to list view and right-click "t001 - deeply nested"
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");

  // Click "Find in Bundles" from the context menu
  await editor.clickFindInBundles();
  await page.waitForTimeout(500);

  // Should be back at bundle list with find-in-bundles filter active
  await bundleList.expectHeadingVisible();
  await bundleList.expectFindInBundlesFilterActive("t001 - deeply nested");

  // Only the small bundle should be in the main (current) list —
  // the example bundle is filtered out because it doesn't track this page
  await bundleList.expectBundleVisible(Bundle.Small);
  await bundleList.expectBundleNotVisible(Bundle.Big);
  await bundleList.expectBundleNotVisible(Bundle.Example);
  await addKeyFrame(findInBundles);
  await addKeyFrame(multiBundle);
  await snapshot("current tab shows only small bundle");

  // The archived tab should show a badge indicating 1 match
  await bundleList.expectArchivedTabBadge(1);
  await snapshot("archived tab badge shows 1 match");

  // Click on the archived tab — big bundle should be visible there
  await bundleList.clickArchivedTab();
  await page.waitForTimeout(250);
  await bundleList.expectBundleVisible(Bundle.Big);
  await addKeyFrame(archived);
  await snapshot("archived tab shows big bundle match");

  // Clearing Find in Bundles ends the mode instead of offering to apply the
  // same filter a second time.
  await bundleList.clearFindInBundlesFilter("t001 - deeply nested");
  await bundleList.expectFindInBundlesFilterCleared("t001 - deeply nested");
  await snapshot("find in bundles cleared");
  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await skipMeadowHomeStateCheck();
});
