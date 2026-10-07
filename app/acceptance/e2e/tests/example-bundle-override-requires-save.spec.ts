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
import {
  BundleListPage,
  BundleEditorPage,
  SelectedPageDetailComponent,
  FilterPanelComponent,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { sourcingReviewRedesign, bundleConfig, overrides, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`adding a depth override on a child page requires proposal acceptance`);

const description = linkedScenarioDescription(conceptText`Add a depth override to a child page. Unlike simple tracking changes, the override
should remain pending until explicitly saved.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '37d9c264-c863-4ac7-8b91-402f52ef1ffb' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
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
  // Select a page without an override.
  await sourceCommand(() => editor.expectUndoNotVisible());

  // Select a non-initial child page that has no existing override
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.clickListViewRowByExactName("First Principles Thinking"));
  await sourceCommand(() => page.waitForTimeout(500));

  // Expand the page's details to reach the outlink depth override controls
  const detail = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await sourceCommand(() => detail.openDetails());
  await sourceCommand(() => checkpoint("child page selected with details open"));

  // Stage a traversal override without changing accepted curation.
  await sourceCommand(() => detail.addOutlinksDepthOverride(0));
  await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
  await sourceCommand(() => addKeyFrame(bundleConfig));
  await sourceCommand(() => checkpoint("override is captured in the sourcing proposal"));
  await sourceCommand(() => editor.sourceReview.defer());
  await sourceCommand(() => editor.expectUndoNotVisible());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => checkpoint("accepted override is now available to curation"));

  // Find the page using the override filter.
  // Verify the override persisted: the Depth Override filter should now
  // include "First Principles Thinking".
  await sourceCommand(() => filterPanel.enableFilter("Depth Override"));
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Depth Override"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  await sourceCommand(() => editor.expectListViewRowByExactNamePresent("First Principles Thinking"));
  await sourceCommand(() => addKeyFrame(overrides));
  await sourceCommand(() => checkpoint("override page appears under Depth Override filter"));

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
