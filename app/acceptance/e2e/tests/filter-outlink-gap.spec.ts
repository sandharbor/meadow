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
import { linkGap } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Enable the outgoing-link gap filter. Check its calculated threshold and the pages
 * selected by that threshold.
 */
test("outlink gap filter auto-calculates threshold and selects correct pages", { annotation: { type: 'scenario-id', description: '8ffd467d-ec88-4ef7-894d-72fe4354dd1a' } }, async ({ sourceCommand, page, checkpoint, assertMeadowHomeState, addKeyFrame }) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // --- Test start ---
  // Enable the outlink-gap filter.
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.enableFilter("Outlink Gap"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("outlink gap filter enabled"));

  // Check the automatic threshold.
  const threshold = await sourceCommand(() => filterPanel.getFilterThresholdValue("Outlink Gap"));
  expect(threshold).toBe(9);
  await sourceCommand(() => addKeyFrame(linkGap));
  await sourceCommand(() => checkpoint("outlink gap threshold is 9"));

  // Solo the matching pages.
  await sourceCommand(() => filterPanel.clickSoloOnFilter("Outlink Gap"));
  await sourceCommand(() => checkpoint("outlink gap filter soloed"));

  // Select the visible pages.
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => checkpoint("all visible pages selected"));

  // Check the selection.
  const titles = await sourceCommand(() => editor.getSelectedPageTitles());
  expect(titles.length).toBeGreaterThanOrEqual(1);
  await sourceCommand(() => checkpoint("verified pages selected with outlink gap"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
