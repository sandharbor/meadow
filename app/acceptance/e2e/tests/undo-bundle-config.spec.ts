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
import { sourcingReviewRedesign, bundleConfig, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Discarding a sourcing depth proposal restores accepted configuration`);

const description = linkedScenarioDescription(conceptText`Change page configuration within a bundle, then use Undo. The editor should restore the
saved configuration without leaving the bundle.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '01d8b979-ec0a-47fa-b0ce-26627d7c7ad4' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());

  const editor = new BundleEditorPage(page, expect);

  // Switch to list view and record original page count
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  const originalCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(originalCount).toBeGreaterThan(10);
  await sourceCommand(() => checkpoint("list view - original page count"));

  // --- Test start ---
  // Select the initial page.
  await sourceCommand(() => editor.clickListViewRowByExactName("main page"));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => checkpoint("main page selected - details auto-opened"));

  // Reduce traversal in the isolated proposal; departing pages remain comparison context.
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await sourceCommand(() => detail.setOutlinksDepth(1));
  await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
  await sourceCommand(() => checkpoint("reduced scope remains pending alongside departing context"));
  await sourceCommand(() => editor.sourceReview.discard());
  await sourceCommand(() => editor.switchToListView());
  expect(await sourceCommand(() => editor.getListViewPageCount())).toBe(originalCount);

  // The depth input should show the original value (4), not the stale edit (1)
  const restoredDetail = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await sourceCommand(() => restoredDetail.expectOutlinksDepthInputValue("4"));

  await sourceCommand(() => addKeyFrame(bundleConfig));
  await sourceCommand(() => checkpoint("after undo - page count and depth restored"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
