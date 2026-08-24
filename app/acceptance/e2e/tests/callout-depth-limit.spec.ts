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
import { callout } from "../src/scenario-docs/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "none" });

test("Callout depth limit shown on new bundle and dismissed permanently", async ({
  page,
  testServer,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await bundleList.expectCalloutVisible("Turn your notes into bundles");

  // Click "create a bundle" in the empty state callout
  await bundleList.clickCreateBundleLink();

  // Fill in the Create New Bundle modal
  const createModal = new CreateAndEditBundleModal(page, expect);
  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("main page");
  await createModal.selectSuggestion("main page");
  await createModal.clickCreateBundle();

  // Wait for graph view to load
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("main-page");

  // Assert depth callout is visible
  await editor.expectDepthCalloutVisible();
  await addKeyFrame(callout);
  await snapshot("depth callout visible on new bundle");

  // Dismiss the callout and wait for the API call to complete before navigating
  const dismissalResponse = page.waitForResponse(
    (resp) => resp.url().includes("/callout-dismissal/") && resp.status() === 200
  );
  await editor.dismissDepthCallout();
  await dismissalResponse;

  // Go back to bundle list
  await editor.clickBackToBundles();
  await bundleList.expectHeadingVisible();

  // Re-enter the bundle
  await bundleList.clickBundle("main-page");
  await editor.waitForLoad("main-page");

  // Assert depth callout is NOT visible (dismissal persisted)
  await editor.expectDepthCalloutNotVisible();
  await snapshot("depth callout not visible after dismissal");
  void customBundle;

  await assertMeadowHomeState();
});
