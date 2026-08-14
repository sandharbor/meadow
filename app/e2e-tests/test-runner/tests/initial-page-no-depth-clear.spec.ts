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
import { SelectedPageDetailComponent } from "../src/run/pages/BundleEditorPage/components/SelectedPageDetailComponent.js";
import { Fixture } from "../src/run/workflows.js";
import { initialPage, bundleConfig } from "../src/scenario-docs/index.js";
import { exampleBundle, exampleBundleInitialPageTitle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.None });

test("a publisher should not be able to remove the depth on the initial page", async ({
  page, snapshot, assertMeadowHomeState, addKeyFrame,
}) => {
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle and switch to list view
  await bundleList.goto();
  await bundleList.clickAddExampleBundleLink();
  await editor.waitForLoad("example-bundle");
  await editor.switchToListView();
  await page.waitForTimeout(250);

  // Click the initial page — its details auto-expand (depth 0)
  await editor.clickListViewRowByExactName(exampleBundleInitialPageTitle);
  await page.waitForTimeout(250);

  // The initial page has a depth set but the Remove override button should NOT be visible
  const initialDetail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await initialDetail.expectRemoveOutlinksDepthNotVisible();
  await addKeyFrame(initialPage);
  await snapshot("initial page depth has no remove override button");

  // Click a non-initial page that has a depth override
  await editor.clickListViewRowByExactName("Cognitive Biases");
  await page.waitForTimeout(250);

  // Open details and verify the Remove override button IS visible
  const overrideDetail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await overrideDetail.openDetails();
  await page.waitForTimeout(250);
  await overrideDetail.expectRemoveOutlinksDepthVisible();
  await addKeyFrame(bundleConfig);
  await snapshot("non-initial page depth has remove override button");

  void exampleBundle;

  await assertMeadowHomeState();
});
