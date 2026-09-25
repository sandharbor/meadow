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

import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal } from "../src/run/pages/index.js";
import { bundleConfig } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_minimal" });

/*
 * Create bundles with different traversal depths. Each should use the chosen depths
 * without showing the introductory depth callout.
 */
test("new bundle uses chosen depths without the introductory depth callout", async ({
  page,
  testServer,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await bundleList.goto();

  await checkpoint("the empty bundle list is ready for creation");

  // --- Test start ---
  // Create bundles with different traversal depths.
  for (const outlinksDepth of [2, 4]) {
    const slug = `main-page-depth-${outlinksDepth}`;
    await bundleList.clickCreateNewBundle();
    if (outlinksDepth === 2) {
      await createModal.fillSourceDirectory(path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data"));
    }
    await createModal.typeInitialPageTitle("main page");
    await createModal.selectSuggestion("main page");
    await createModal.fillDefaultTraversalDepths(outlinksDepth, 0);
    await createModal.clickEditSlug();
    await createModal.fillSlug(slug);
    await addKeyFrame(bundleConfig);
    await createModal.clickCreateBundle();
    await editor.waitForLoad(slug);
    await editor.expectGraphViewHasPages();
    await editor.expectDepthCalloutNotVisible();
    await addKeyFrame(bundleConfig);
    await checkpoint(`new bundle with chosen traversal depth ${outlinksDepth}`);

    // Reopen the bundle.
    await editor.clickBackToBundles();
    await bundleList.clickBundle(slug);
    await editor.waitForLoad(slug);
    await editor.expectDepthCalloutNotVisible();
    await checkpoint(`depth ${outlinksDepth} bundle reopened without introductory callout`);

    // Return to the list for the next depth.
    await editor.clickBackToBundles();
  }
  void customBundle;
  await assertMeadowHomeState();
});
