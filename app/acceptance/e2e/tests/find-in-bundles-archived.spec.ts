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
import { Workflows, Bundle } from "../src/run/workflows.js";
import { findInBundles, archived, multiBundle, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle, smallBundle, exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`find in bundles shows archived match indicator and archived tab`);

const description = linkedScenarioDescription(conceptText`Find a page that also belongs to an archived bundle. The search should identify the
archived match and open it through the archived list.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2d70b840-01c1-47ff-9364-c778fb4646f9' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle so the bundle list has more entries, making the
  // find-in-bundles filtering more visually obvious.
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.addExampleBundleFromMenu());
  await sourceCommand(() => page.waitForTimeout(2000));
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Example));
  await sourceCommand(() => checkpoint("bundle list with example bundle added"));

  // --- Test start ---
  // Archive the big bundle.
  await sourceCommand(() => bundleList.archiveBundle(Bundle.Big));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Big));
  await sourceCommand(() => checkpoint("big bundle archived"));

  // Find the shared page from the small bundle.
  await sourceCommand(() => bundleList.clickBundle(Bundle.Small));
  await sourceCommand(() => editor.waitForLoad(Bundle.Small));

  // Switch to list view and right-click "t001 - deeply nested"
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));

  // Click "Find in Bundles" from the context menu
  await sourceCommand(() => editor.clickFindInBundles());
  await sourceCommand(() => page.waitForTimeout(500));

  // Should be back at bundle list with find-in-bundles filter active
  await sourceCommand(() => bundleList.expectHeadingVisible());
  await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));

  // Only the small bundle should be in the main (current) list —
  // the example bundle is filtered out because it doesn't track this page
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Small));
  await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Big));
  await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Example));
  await sourceCommand(() => addKeyFrame(findInBundles));
  await sourceCommand(() => addKeyFrame(multiBundle));
  await sourceCommand(() => checkpoint("current tab shows only small bundle"));

  // Check the archived match count.
  await sourceCommand(() => bundleList.expectArchivedTabBadge(1));
  await sourceCommand(() => checkpoint("archived tab badge shows 1 match"));

  // Open the archived matches.
  await sourceCommand(() => bundleList.clickArchivedTab());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Big));
  await sourceCommand(() => addKeyFrame(archived));
  await sourceCommand(() => checkpoint("archived tab shows big bundle match"));

  // Clear the page filter.
  // Clearing Find in Bundles ends the mode instead of offering to apply the
  // same filter a second time.
  await sourceCommand(() => bundleList.clearFindInBundlesFilter("t001 - deeply nested"));
  await sourceCommand(() => bundleList.expectFindInBundlesFilterCleared("t001 - deeply nested"));
  await sourceCommand(() => checkpoint("find in bundles cleared"));

  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
