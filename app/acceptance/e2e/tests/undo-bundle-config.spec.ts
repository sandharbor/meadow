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
import { BundleEditorPage, SelectedPageDetailComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { sourcingReviewRedesign, bundleConfig } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Change page configuration within a bundle, then use Undo. The editor should restore the
 * saved configuration without leaving the bundle.
 */
test("Discarding a sourcing depth proposal restores accepted configuration", async ({
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();

  const editor = new BundleEditorPage(page, expect);

  // Switch to list view and record original page count
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const originalCount = await editor.getListViewPageCount();
  expect(originalCount).toBeGreaterThan(10);
  await checkpoint("list view - original page count");

  // --- Test start ---
  // Select the initial page.
  await editor.clickListViewRowByExactName("main page");
  await page.waitForTimeout(500);
  await checkpoint("main page selected - details auto-opened");

  // Reduce traversal in the isolated proposal; departing pages remain comparison context.
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.setOutlinksDepth(1);
  await expect(editor.sourceReview.root).toBeVisible();
  await checkpoint("reduced scope remains pending alongside departing context");
  await editor.sourceReview.discard();
  await editor.switchToListView();
  expect(await editor.getListViewPageCount()).toBe(originalCount);

  // The depth input should show the original value (4), not the stale edit (1)
  const restoredDetail = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await restoredDetail.expectOutlinksDepthInputValue("4");

  await addKeyFrame(bundleConfig);
  await checkpoint("after undo - page count and depth restored");

  void bigBundle;

  await assertMeadowHomeState();
});
