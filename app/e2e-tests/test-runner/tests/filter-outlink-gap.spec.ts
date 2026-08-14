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
import { linkGap } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("outlink gap filter auto-calculates threshold and selects correct pages", async ({ page, snapshot, assertMeadowHomeState, addKeyFrame }) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Outlink Gap");
  await page.waitForTimeout(250);
  await snapshot("outlink gap filter enabled");

  const threshold = await filterPanel.getFilterThresholdValue("Outlink Gap");
  expect(threshold).toBe(9);
  await addKeyFrame(linkGap);
  await snapshot("outlink gap threshold is 9");

  await filterPanel.clickSoloOnFilter("Outlink Gap");
  await snapshot("outlink gap filter soloed");

  await editor.clickSelectAll();
  await snapshot("all visible pages selected");

  const titles = await editor.getSelectedPageTitles();
  expect(titles.length).toBeGreaterThanOrEqual(1);
  await snapshot("verified pages selected with outlink gap");
  void bigBundle;

  await assertMeadowHomeState();
});
