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

/*
 * Find a page shared by the small and big bundles. Opening the other match should select
 * that page in the destination bundle.
 */
test("find in bundles navigates from small bundle to big bundle with page auto-selected", { annotation: { type: 'scenario-id', description: 'f1f1b810-8fb1-40d2-8c0c-108081f4e876' } }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle so the bundle list has more entries, making the
  // find-in-bundles filtering more visually obvious.
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.addExampleBundleFromMenu());
  await sourceCommand(() => page.waitForTimeout(2000));
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Example));
  await sourceCommand(() => checkpoint("bundle list with example bundle added"));

  // --- Test start ---
  // Open the small bundle.
  await sourceCommand(() => bundleList.clickBundle(Bundle.Small));
  await sourceCommand(() => editor.waitForLoad(Bundle.Small));
  await sourceCommand(() => checkpoint("small bundle loaded"));

  // Open the shared page menu.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));
  await sourceCommand(() => checkpoint("context menu open on t001"));

  // Find the page in other bundles.
  await sourceCommand(() => editor.clickFindInBundles());
  await sourceCommand(() => page.waitForTimeout(500));

  // Should be back at bundle list with find-in-bundles filter active
  await sourceCommand(() => bundleList.expectHeadingVisible());
  await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));
  await sourceCommand(() => checkpoint("bundle list with find in bundles filter active"));

  // Check the matching bundles.
  // Both Big and Small should be visible (both track this page),
  // but the example bundle should be filtered out
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Big));
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Small));
  await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Example));
  await sourceCommand(() => addKeyFrame(findInBundles));
  await sourceCommand(() => addKeyFrame(multiBundle));

  // Click on the big bundle
  await sourceCommand(() => bundleList.clickBundle(Bundle.Big));
  await sourceCommand(() => editor.waitForLoad(Bundle.Big));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => checkpoint("big bundle loaded with auto-selected page"));

  // Check the automatic selection.
  const selectedTitles = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(selectedTitles).toContain("t001 - deeply nested");

  // Solo the selected pages to isolate the found page
  await sourceCommand(() => editor.clickSoloSelection());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("solo mode with found page"));

  // Inspect the found page in list view.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  const listCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(listCount).toBe(1);
  await sourceCommand(() => checkpoint("list view showing only the found page"));

  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
