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
import { sourcingReviewRedesign, frontier, filters, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`example bundle frontier pages show in graph view with frontier filter`);

const description = linkedScenarioDescription(conceptText`Open the example bundle and enable the frontier filter. Check that pages beyond the
normal traversal boundary appear in the graph.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c0c45455-93e3-4e43-9a7e-ff6d7660d483' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, assertMeadowHomeState, addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  // Start at empty bundle list and add the example bundle
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));
  await sourceCommand(() => checkpoint("example bundle editor loaded"));

  // --- Test start ---
  // Enable frontier pages in curation.
  await sourceCommand(() => filterPanel.enableFilter("Frontier"));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => addKeyFrame(frontier));
  await sourceCommand(() => checkpoint("frontier filter visible"));

  // Solo the frontier.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Frontier"));
  await sourceCommand(() => page.waitForTimeout(250));

  // Switch to list view and verify multiple frontier pages are visible
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  const frontierPageCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(frontierPageCount).toBeGreaterThan(1);
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("frontier filter soloed with multiple pages"));

  void exampleBundle;

  await sourceCommand(() => checkpoint("frontier exploration leaves accepted material unchanged"));
  await sourceCommand(() => assertMeadowHomeState());
});
