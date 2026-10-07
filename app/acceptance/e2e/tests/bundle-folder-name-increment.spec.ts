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
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { bundleConfig, callout, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`creating a second bundle from the same source page auto-increments the folder name`);

const description = linkedScenarioDescription(conceptText`Create two bundles from the same source page. The second should receive a distinct
folder name without overwriting the first.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c43f1ffb-20a7-473e-9fe7-d6e3bc027e52' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);

  // Navigate to the big bundle and use find-in-bundles for a page
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));
  await sourceCommand(() => editor.clickFindInBundles());
  await sourceCommand(() => page.waitForTimeout(500));

  await sourceCommand(() => checkpoint("the source page is selected for bundle creation"));

  // --- Test start ---
  // Create the first bundle.
  // Bundle list with find-in-bundles filter active — create first bundle
  await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));
  await sourceCommand(() => bundleList.clickCreateBundleForPage());
  await sourceCommand(() => createModal.clickCreateBundle());

  // Should navigate to the new bundle editor (slug: t001-deeply-nested)
  await sourceCommand(() => editor.waitForLoad("t001-deeply-nested"));
  await sourceCommand(() => checkpoint("first bundle created"));

  // Create another bundle from the same page.
  await sourceCommand(() => editor.clickBackToBundles());
  await sourceCommand(() => bundleList.expectHeadingVisible());
  await sourceCommand(() => bundleList.clickBundle(Bundle.Big));
  await sourceCommand(() => editor.waitForLoad(Bundle.Big));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));
  await sourceCommand(() => editor.clickFindInBundles());
  await sourceCommand(() => page.waitForTimeout(500));

  // Open create modal — slug should already be auto-incremented
  await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));
  await sourceCommand(() => bundleList.clickCreateBundleForPage());
  await sourceCommand(() => createModal.showDetails());

  // Verify the slug is already unique (t001-deeply-nested-1)
  const slugText = await sourceCommand(() => createModal.getSlugDisplayText());
  expect(slugText).toBe("t001-deeply-nested-1");
  await sourceCommand(() => addKeyFrame(bundleConfig));
  await sourceCommand(() => checkpoint("second create modal shows incremented slug"));

  // Try the occupied folder name.
  await sourceCommand(() => createModal.clickEditSlug());
  await sourceCommand(() => createModal.fillSlug("t001-deeply-nested"));

  // Should show a conflict error and disable the Create Bundle button
  await sourceCommand(() => createModal.expectSlugConflictError('already exists'));
  await sourceCommand(() => createModal.expectCreateBundleDisabled());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("slug conflict error shown"));

  // Restore the available name and create.
  await sourceCommand(() => createModal.fillSlug("t001-deeply-nested-1"));
  await sourceCommand(() => page.waitForTimeout(100));

  // Create the second bundle — should succeed with the incremented slug
  await sourceCommand(() => createModal.clickCreateBundle());
  await sourceCommand(() => editor.waitForLoad("t001-deeply-nested-1"));
  await sourceCommand(() => checkpoint("second bundle created with incremented folder name"));

  void bigBundle;
  void bundles;

  await sourceCommand(() => assertMeadowHomeState());
});
