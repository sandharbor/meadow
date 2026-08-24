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
import { callout } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test("callout for marking source node sensitive the first time", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  const editor = new BundleEditorPage(page, expect);

  // Switch to list view so we can reliably target a specific non-sensitive page
  await editor.switchToListView();
  await page.waitForTimeout(250);

  // Right-click on a non-sensitive page to get the context menu
  await editor.rightClickRow("t002 - dup pages and images");

  // Choose "Mark Sensitive" from the context menu
  await editor.clickMarkSensitive();

  // Should see the consent modal ("Heads Up") since this is the first time
  await editor.expectConsentModalVisible();
  await addKeyFrame(callout);
  await snapshot("consent modal visible for first sensitive marking");

  // Agree to it
  await editor.clickConsentProceed();
  await page.waitForTimeout(500);
  await snapshot("first page marked sensitive");

  // Right-click on another non-sensitive page
  await editor.rightClickRow("t005 - in and out links");

  // Choose "Mark Sensitive" again
  await editor.clickMarkSensitive();
  await page.waitForTimeout(500);

  // No consent modal this time - the dismissal persisted
  await editor.expectConsentModalNotVisible();
  await snapshot("second page marked sensitive without consent modal");

  // Solo the sensitive pages
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.clickSoloOnFilter("Sensitive");
  await page.waitForTimeout(250);

  // Select all and verify 3 pages (the 2 we just marked + the page that is
  // already sensitive in the source fixture).
  await editor.clickSelectAll();
  await page.waitForTimeout(250);
  const selectedTitles = await editor.getSelectedPageTitles();
  expect(selectedTitles.length).toBe(3);
  await snapshot("3 sensitive pages selected after solo");

  // Remove the solo
  await filterPanel.clickSoloOnFilter("Sensitive");
  await page.waitForTimeout(250);
  await snapshot("solo removed");

  // Now mark those two pages as not sensitive via right-click
  // First page
  await editor.rightClickRow("t002 - dup pages and images");
  await editor.clickMarkNotSensitive();
  await page.waitForTimeout(500);

  // Second page
  await editor.rightClickRow("t005 - in and out links");
  await editor.clickMarkNotSensitive();
  await page.waitForTimeout(500);
  await snapshot("two pages unmarked as sensitive");

  // Solo sensitive pages again, select all - the source-sensitive page remains.
  await filterPanel.clickSoloOnFilter("Sensitive");
  await page.waitForTimeout(250);
  await editor.clickSelectAll();
  await page.waitForTimeout(250);
  const selectedTitlesAfter = await editor.getSelectedPageTitles();
  expect(selectedTitlesAfter.length).toBe(1);
  await snapshot("1 sensitive page remaining after unmarking two");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
