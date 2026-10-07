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
import { bundleConfig, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_minimal" });

const name = linkedScenarioName(conceptText`new bundle uses chosen depths without the introductory depth callout`);

const description = linkedScenarioDescription(conceptText`Create bundles with different traversal depths. Each should use the chosen depths
without showing the introductory depth callout.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '6296a54a-ba3a-43bf-993d-5925b6b708c5' }, name.annotation, description.annotation] }, async ({ sourceCommand,
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
  await sourceCommand(() => bundleList.goto());

  await sourceCommand(() => checkpoint("the empty bundle list is ready for creation"));

  // --- Test start ---
  // Create bundles with different traversal depths.
  for (const outlinksDepth of [2, 4]) {
    const slug = `main-page-depth-${outlinksDepth}`;
    await sourceCommand(() => bundleList.clickCreateNewBundle());
    if (outlinksDepth === 2) {
      await sourceCommand(() => createModal.fillSourceDirectory(path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data")));
    }
    await sourceCommand(() => createModal.typeInitialPageTitle("main page"));
    await sourceCommand(() => createModal.selectSuggestion("main page"));
    await sourceCommand(() => createModal.fillDefaultTraversalDepths(outlinksDepth, 0));
    await sourceCommand(() => createModal.clickEditSlug());
    await sourceCommand(() => createModal.fillSlug(slug));
    await sourceCommand(() => addKeyFrame(bundleConfig));
    await sourceCommand(() => createModal.clickCreateBundle());
    await sourceCommand(() => editor.waitForLoad(slug));
    await sourceCommand(() => editor.expectGraphViewHasPages());
    await sourceCommand(() => editor.expectDepthCalloutNotVisible());
    await sourceCommand(() => addKeyFrame(bundleConfig));
    await sourceCommand(() => checkpoint(`new bundle with chosen traversal depth ${outlinksDepth}`));

    // Reopen the bundle.
    await sourceCommand(() => editor.clickBackToBundles());
    await sourceCommand(() => bundleList.clickBundle(slug));
    await sourceCommand(() => editor.waitForLoad(slug));
    await sourceCommand(() => editor.expectDepthCalloutNotVisible());
    await sourceCommand(() => checkpoint(`depth ${outlinksDepth} bundle reopened without introductory callout`));

    // Return to the list for the next depth.
    await sourceCommand(() => editor.clickBackToBundles());
  }
  void customBundle;
  await sourceCommand(() => assertMeadowHomeState());
});
