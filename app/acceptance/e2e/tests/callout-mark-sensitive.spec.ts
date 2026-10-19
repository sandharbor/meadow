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

import path from 'node:path';
import { sourceSensitivity } from '../src/run/utils/sourceSensitivity.js';
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { sourcingReviewRedesign, callout, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleSourcing, sensitive } from "../../../concepts/index.js";
import { scenarioDesignPressures, preventAccidentalSharing } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`callout for marking source node sensitive the first time`);

const description = linkedScenarioDescription(conceptText`Mark a page as sensitive for the first time. Check that the introductory callout
explains the source change and can be dismissed.`);
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
const areas = scenarioAreas([bundleCuration, bundleSourcing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b6df7a57-471f-4913-be4a-30eb32c38735' }, name.annotation, description.annotation, areas.annotation, pressures.annotation] }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  const sourceFile = (name: string) => path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data', `${name}.md`);
  const markedNames = ['t002 - dup pages and images', 't005 - in and out links'];
  for (const name of markedNames) expect(sourceSensitivity(sourceFile(name))).toBeUndefined();

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
  await expect.poll(() => sourceSensitivity(sourceFile(markedNames[0]))).toBe(true);
  await sourceCommand(() => checkpoint("first page marked sensitive in source YAML front matter"));

  // Mark another page sensitive.
  await sourceCommand(() => editor.rightClickRow("t005 - in and out links"));

  // Choose "Mark Sensitive" again
  await sourceCommand(() => editor.clickMarkSensitive());
  await sourceCommand(() => page.waitForTimeout(500));

  // No consent modal this time - the dismissal persisted
  await sourceCommand(() => editor.expectConsentModalNotVisible());
  await expect.poll(() => sourceSensitivity(sourceFile(markedNames[1]))).toBe(true);
  await sourceCommand(() => checkpoint("second page marked sensitive without consent modal"));

  // Accept and inspect the sensitive pages.
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.reviewTrackingChoices(2));
  for (const name of markedNames) {
    await sourceCommand(() => editor.sourceReview.resolveSensitiveTracking(name, true));
  }
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
  expect(selectedTitles.sort()).toEqual([...markedNames, 't004 ---- sensitive page'].sort());
  await sourceCommand(() => addKeyFrame(sensitive));
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
  for (const name of markedNames) await expect.poll(() => sourceSensitivity(sourceFile(name))).toBeUndefined();
  await sourceCommand(() => checkpoint("two pages unmarked and their source YAML sensitivity removed"));

  // Accept the edits and inspect the remaining page.
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());

  // Solo sensitive pages again, select all - the source-sensitive page remains.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(250));
  const selectedTitlesAfter = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(selectedTitlesAfter).toEqual(['t004 ---- sensitive page']);
  expect(sourceSensitivity(sourceFile('t004 ---- sensitive page'))).toBe(true);
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint("1 sensitive page remaining after unmarking two"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
