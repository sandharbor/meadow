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
import { BundleEditorPage, BundleListPage, DeleteBundleModal } from "../src/run/pages/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { deletion, callout } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("Delete unpublished bundle from within bundle editor", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();

  const editor = new BundleEditorPage(page, expect);
  const deleteModal = new DeleteBundleModal(page, expect);

  // Open bundle options menu and click Delete bundle
  await editor.clickBundleOptionsMenu();
  await editor.clickDeleteBundleOption();

  // Verify delete confirmation modal
  await deleteModal.expectVisible();
  await addKeyFrame(callout);
  await addKeyFrame(deletion);
  await snapshot("delete confirmation for unpublished bundle");

  // Confirm deletion
  await deleteModal.confirmDelete();

  // Should navigate back to bundle list automatically
  const bundleList = new BundleListPage(page, expect);
  await bundleList.expectHeadingVisible();
  await bundleList.expectBundleNotVisible(Bundle.Big);
  await snapshot("bundle list after deletion - bundle gone");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
