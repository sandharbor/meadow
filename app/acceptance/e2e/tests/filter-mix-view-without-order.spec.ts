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
import { FilterPanelComponent, BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { filters, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`without mix terms can be reordered by dropping one directly on the other`);

const description = linkedScenarioDescription(conceptText`Build a filter expression with two exclusions and drag one onto the other. The
expression should preserve the intended ordering and result.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '9a8a5d08-d311-4deb-81a8-c6b2a608761e' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToBigBundle());

  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await sourceCommand(() => checkpoint("the bundle is ready to combine filters"));

  // --- Test start ---
  // Build a selection without untracked pages.
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => editor.clickSoloSelection());
  await sourceCommand(() => filterPanel.enableAndSoloFilter("Untracked"));

  await sourceCommand(() => filterPanel.openMixFilters());
  await sourceCommand(() => filterPanel.expectMixTermOrder(["Selection Solo", "Untracked"]));
  await sourceCommand(() => filterPanel.chooseMixOperator("Without"));
  await sourceCommand(() => filterPanel.closeMixFilters());
  await sourceCommand(() => editor.expectGraphViewHasPages());
  await sourceCommand(() => checkpoint("selection without untracked pages"));

  // Reverse the filter order.
  await sourceCommand(() => filterPanel.openMixFilters());
  await sourceCommand(() => filterPanel.dragMixTermOnto("Selection Solo", "Untracked"));
  await sourceCommand(() => filterPanel.expectMixTermOrder(["Untracked", "Selection Solo"]));
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("without terms reordered directly"));

  // Check the reversed result.
  await sourceCommand(() => filterPanel.closeMixFilters());
  await sourceCommand(() => editor.expectGraphViewPageCount(0));
  await sourceCommand(() => checkpoint("untracked without the selected pages is empty"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
