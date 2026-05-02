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
import { SiteEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { labels } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("enabling show titles on untracked filter displays page title labels", async ({ page, snapshot, addKeyFrame }) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSite();
  await snapshot("site editor loaded");

  // Enable the Untracked filter
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Untracked");
  await snapshot("untracked filter enabled");

  // Turn on show titles for the Untracked filter
  await filterPanel.clickShowTitlesOnFilter("Untracked");
  await page.waitForTimeout(300);

  // Verify that a known untracked page title is visible as a label
  const editor = new SiteEditorPage(page, expect);
  await editor.expectLabelVisible("t012 - custom filters");
  await snapshot("titles shown for untracked pages");

  // Take keyframe with titles visible
  await addKeyFrame(labels);

  // Solo the untracked filter
  await filterPanel.clickSoloOnFilter("Untracked");
  await page.waitForTimeout(300);
  await snapshot("untracked filter soloed with titles");

  // Take another keyframe in solo mode
  await addKeyFrame(labels);
  void bigSite;
});
