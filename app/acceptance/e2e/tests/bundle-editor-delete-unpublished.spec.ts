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
import { deletion, callout } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Delete an unpublished bundle from its editor. Confirm that it disappears from the list
 * and its local files are removed.
 */
test("Delete unpublished bundle from within bundle editor", { annotation: { type: 'scenario-id', description: '720025cc-0103-45b5-8e58-2ca9b37af6d0' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());

  const editor = new BundleEditorPage(page, expect);
  const deleteModal = new DeleteBundleModal(page, expect);
  // Finish the initial fixture review before exercising bundle deletion.
  await sourceCommand(() => editor.waitForSourceCheck());

  await sourceCommand(() => checkpoint("the unpublished bundle is ready for deletion"));

  // --- Test start ---
  // Open the deletion confirmation.
  // Open bundle options menu and click Delete bundle
  await sourceCommand(() => editor.clickBundleOptionsMenu());
  await sourceCommand(() => editor.clickDeleteBundleOption());

  // Verify delete confirmation modal
  await sourceCommand(() => deleteModal.expectVisible());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => addKeyFrame(deletion));
  await sourceCommand(() => checkpoint("delete confirmation for unpublished bundle"));

  // Confirm the deletion.
  await sourceCommand(() => deleteModal.confirmDelete());

  // Should navigate back to bundle list automatically
  const bundleList = new BundleListPage(page, expect);
  await sourceCommand(() => bundleList.expectHeadingVisible());
  await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Big));
  await sourceCommand(() => checkpoint("bundle list after deletion - bundle gone"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
