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
import { BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { sourcingReviewRedesign, callout } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Mark a page as sensitive for the first time. Check that the introductory callout
 * explains the source change and can be dismissed.
 */
test("callout for marking source node sensitive the first time", { annotation: { type: 'scenario-id', description: 'b6df7a57-471f-4913-be4a-30eb32c38735' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // --- Test start ---
  // Mark the first page sensitive.
  const editor = new BundleEditorPage(page, expect);

  // Switch to list view so we can reliably target a specific non-sensitive page
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  // Right-click on a non-sensitive page to get the context menu
  await sourceCommand(() => editor.rightClickRow("t002 - dup pages and images"));

  // Choose "Mark Sensitive" from the context menu
  await sourceCommand(() => editor.clickMarkSensitive());

  // Should see the consent modal ("Heads Up") since this is the first time
  await sourceCommand(() => editor.expectConsentModalVisible());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("consent modal visible for first sensitive marking"));

  // Accept the explanation.
  await sourceCommand(() => editor.clickConsentProceed());
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => checkpoint("first page marked sensitive"));

  // Mark another page sensitive.
  await sourceCommand(() => editor.rightClickRow("t005 - in and out links"));

  // Choose "Mark Sensitive" again
  await sourceCommand(() => editor.clickMarkSensitive());
  await sourceCommand(() => page.waitForTimeout(500));

  // No consent modal this time - the dismissal persisted
  await sourceCommand(() => editor.expectConsentModalNotVisible());
  await sourceCommand(() => checkpoint("second page marked sensitive without consent modal"));

  // Accept and inspect the sensitive pages.
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());

  // Solo the sensitive pages
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));

  // Select all and verify 3 pages (the 2 we just marked + the page that is
  // already sensitive in the source fixture).
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(250));
  const selectedTitles = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(selectedTitles.length).toBe(3);
  await sourceCommand(() => checkpoint("3 sensitive pages selected after solo"));

  // Remove the solo.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("solo removed"));

  // Remove both sensitivity markings.
  // Now mark those two pages as not sensitive via right-click
  // First page
  await sourceCommand(() => editor.rightClickRow("t002 - dup pages and images"));
  await sourceCommand(() => editor.clickMarkNotSensitive());
  await sourceCommand(() => page.waitForTimeout(500));

  // Second page
  await sourceCommand(() => editor.rightClickRow("t005 - in and out links"));
  await sourceCommand(() => editor.clickMarkNotSensitive());
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => checkpoint("two pages unmarked as sensitive"));

  // Accept the edits and inspect the remaining page.
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());

  // Solo sensitive pages again, select all - the source-sensitive page remains.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(250));
  const selectedTitlesAfter = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(selectedTitlesAfter.length).toBe(1);
  await sourceCommand(() => checkpoint("1 sensitive page remaining after unmarking two"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
