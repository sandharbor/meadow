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
import { SelectedPageDetailComponent } from "../src/run/pages/areas/bundle/curation/SelectedPageDetailComponent.js";
import { Fixture } from "../src/run/workflows.js";
import { sourcingReviewRedesign, initialPage, bundleConfig, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle, exampleBundleInitialPageTitle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`a publisher should not be able to remove the depth on the initial page`);

const description = linkedScenarioDescription(conceptText`Select the starting page and inspect its depth controls. Its required traversal depths
should not be removable.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '5f71211d-5ca3-48b0-8655-686be2662d65' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, assertMeadowHomeState, addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle and switch to list view
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  // Click the initial page — its details auto-expand (depth 0)
  await sourceCommand(() => editor.clickListViewRowByExactName(exampleBundleInitialPageTitle));
  await sourceCommand(() => page.waitForTimeout(250));

  // The initial page has a depth set but the Remove override button should NOT be visible
  const initialDetail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => initialDetail.expectRemoveOutlinksDepthNotVisible());
  await sourceCommand(() => addKeyFrame(initialPage));
  await sourceCommand(() => checkpoint("initial page depth has no remove override button"));

  // --- Test start ---
  // Compare a regular page override.
  await sourceCommand(() => editor.clickListViewRowByExactName("Cognitive Biases"));
  await sourceCommand(() => page.waitForTimeout(250));

  // Open details and verify the Remove override button IS visible
  const overrideDetail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => overrideDetail.openDetails());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => overrideDetail.expectRemoveOutlinksDepthVisible());
  await sourceCommand(() => addKeyFrame(bundleConfig));
  await sourceCommand(() => checkpoint("non-initial page depth has remove override button"));

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
