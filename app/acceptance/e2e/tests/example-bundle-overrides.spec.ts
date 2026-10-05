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
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { sourcingReviewRedesign, filters, overrides, initialPage } from "../../../concepts/index.js";
import { exampleBundle, exampleBundleInitialPageTitle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

/*
 * Apply the Overrides filter to the example bundle. The initial page's required depths
 * should not count as a custom override.
 */
test("overrides filter on example bundle does not include the initial page", { annotation: { type: 'scenario-id', description: '234c4657-7b31-4f5a-9e4c-750bbbf1c5e7' } }, async ({ sourceCommand,
  page, checkpoint, assertMeadowHomeState, addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  // Add the example bundle from the empty state
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));
  await sourceCommand(() => checkpoint("example bundle loaded"));

  // --- Test start ---
  // Enable the override filter.
  await sourceCommand(() => filterPanel.enableFilter("Depth Override"));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("overrides filter enabled"));

  // Solo the overridden pages.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Depth Override"));
  await sourceCommand(() => page.waitForTimeout(250));

  // Switch to list view to inspect which pages are shown
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  // There should be at least one override page (e.g. "Cognitive Biases")
  const overrideCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(overrideCount).toBeGreaterThan(0);

  // The initial page must NOT appear — its depth setting is not an override
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(exampleBundleInitialPageTitle));
  await sourceCommand(() => addKeyFrame(overrides));
  await sourceCommand(() => addKeyFrame(initialPage));
  await sourceCommand(() => checkpoint("overrides soloed without initial page"));

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
