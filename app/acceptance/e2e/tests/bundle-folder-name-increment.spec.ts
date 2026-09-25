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
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { bundleConfig, callout } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Create two bundles from the same source page. The second should receive a distinct
 * folder name without overwriting the first.
 */
test("creating a second bundle from the same source page auto-increments the folder name", async ({
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);

  // Navigate to the big bundle and use find-in-bundles for a page
  await wf.navigateToBigBundle();
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await editor.clickFindInBundles();
  await page.waitForTimeout(500);

  await checkpoint("the source page is selected for bundle creation");

  // --- Test start ---
  // Create the first bundle.
  // Bundle list with find-in-bundles filter active — create first bundle
  await bundleList.expectFindInBundlesFilterActive("t001 - deeply nested");
  await bundleList.clickCreateBundleForPage();
  await createModal.clickCreateBundle();

  // Should navigate to the new bundle editor (slug: t001-deeply-nested)
  await editor.waitForLoad("t001-deeply-nested");
  await checkpoint("first bundle created");

  // Create another bundle from the same page.
  await editor.clickBackToBundles();
  await bundleList.expectHeadingVisible();
  await bundleList.clickBundle(Bundle.Big);
  await editor.waitForLoad(Bundle.Big);
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await editor.clickFindInBundles();
  await page.waitForTimeout(500);

  // Open create modal — slug should already be auto-incremented
  await bundleList.expectFindInBundlesFilterActive("t001 - deeply nested");
  await bundleList.clickCreateBundleForPage();
  await createModal.showDetails();

  // Verify the slug is already unique (t001-deeply-nested-1)
  const slugText = await createModal.getSlugDisplayText();
  expect(slugText).toBe("t001-deeply-nested-1");
  await addKeyFrame(bundleConfig);
  await checkpoint("second create modal shows incremented slug");

  // Try the occupied folder name.
  await createModal.clickEditSlug();
  await createModal.fillSlug("t001-deeply-nested");

  // Should show a conflict error and disable the Create Bundle button
  await createModal.expectSlugConflictError('already exists');
  await createModal.expectCreateBundleDisabled();
  await addKeyFrame(callout);
  await checkpoint("slug conflict error shown");

  // Restore the available name and create.
  await createModal.fillSlug("t001-deeply-nested-1");
  await page.waitForTimeout(100);

  // Create the second bundle — should succeed with the incremented slug
  await createModal.clickCreateBundle();
  await editor.waitForLoad("t001-deeply-nested-1");
  await checkpoint("second bundle created with incremented folder name");

  void bigBundle;
  void bundles;

  await assertMeadowHomeState();
});
