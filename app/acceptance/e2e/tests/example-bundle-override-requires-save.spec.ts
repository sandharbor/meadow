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
import {
  bundleConfig,
  overrides,
} from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

/*
 * Add a depth override to a child page. Unlike simple tracking changes, the override
 * should remain pending until explicitly saved.
 */
test("adding a depth override on a child page requires an explicit save", async ({
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
  await bundleList.goto();
  await bundleList.clickAddExampleBundleLink();
  await editor.waitForLoad("example-bundle");
  await checkpoint("example bundle loaded");

  // --- Test start ---
  // Select a page without an override.
  await editor.expectUndoNotVisible();

  // Select a non-initial child page that has no existing override
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.clickListViewRowByExactName("First Principles Thinking");
  await page.waitForTimeout(500);

  // Expand the page's details to reach the outlink depth override controls
  const detail = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await detail.openDetails();
  await checkpoint("child page selected with details open");

  // Add a traversal override.
  // Adding a depth override is a "complex op" — it should NOT auto-save. The
  // change should land in draft state and surface the Save / Undo buttons.
  await detail.addOutlinksDepthOverride(0);
  await page.waitForTimeout(500);
  await editor.expectUndoVisible();
  await addKeyFrame(bundleConfig);
  await checkpoint("override set - draft state, save button visible");

  // Save the override.
  await editor.clickSave();
  await page.waitForTimeout(1000);
  await editor.expectUndoNotVisible();
  await checkpoint("override saved - draft cleared");

  // Find the page using the override filter.
  // Verify the override persisted: the Depth Override filter should now
  // include "First Principles Thinking".
  await filterPanel.enableFilter("Depth Override");
  await filterPanel.clickSoloOnFilter("Depth Override");
  await page.waitForTimeout(250);
  await editor.switchToListView();
  await page.waitForTimeout(250);

  await editor.expectListViewRowByExactNamePresent("First Principles Thinking");
  await addKeyFrame(overrides);
  await checkpoint("override page appears under Depth Override filter");

  void exampleBundle;

  await assertMeadowHomeState();
});
