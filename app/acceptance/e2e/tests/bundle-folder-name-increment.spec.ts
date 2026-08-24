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
import { bundleConfig, callout } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../src/app-area-docs/index.js";

test.use({ bundleMode: "single-file" });

test("creating a second bundle from the same source page auto-increments the folder name", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
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

  // Bundle list with find-in-bundles filter active — create first bundle
  await bundleList.expectFindInBundlesFilterActive("t001 - deeply nested");
  await bundleList.clickCreateBundleForPage();
  await createModal.clickCreateBundle();

  // Should navigate to the new bundle editor (slug: t001-deeply-nested)
  await editor.waitForLoad("t001-deeply-nested");
  await snapshot("first bundle created");

  // Go back to bundles, do find-in-bundles again for the same page
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
  await snapshot("second create modal shows incremented slug");

  // Keyframe: modal showing the auto-incremented directory name
  await addKeyFrame(bundleConfig);

  // Try editing slug to remove the "-1" suffix (conflict)
  await createModal.clickEditSlug();
  await createModal.fillSlug("t001-deeply-nested");

  // Should show a conflict error and disable the Create Bundle button
  await createModal.expectSlugConflictError('already exists');
  await createModal.expectCreateBundleDisabled();
  await snapshot("slug conflict error shown");

  // Keyframe: callout showing directory already taken
  await addKeyFrame(callout);

  // Cancel the edit by restoring the incremented slug
  await createModal.fillSlug("t001-deeply-nested-1");
  await page.waitForTimeout(100);

  // Create the second bundle — should succeed with the incremented slug
  await createModal.clickCreateBundle();
  await editor.waitForLoad("t001-deeply-nested-1");
  await snapshot("second bundle created with incremented folder name");
  void bigBundle;
  void bundles;

  await assertMeadowHomeState();
});
