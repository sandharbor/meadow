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
import { FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { callout, sensitive } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Callout tooltip shown when hovering sensitive filter question mark", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSite();
  await snapshot("site editor loaded");

  // Enable the sensitive filter so the question mark icon appears
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.enableFilter("Sensitive");
  await page.waitForTimeout(250);
  await snapshot("sensitive filter enabled");

  // Hover over the question mark icon next to the sensitive filter
  await filterPanel.hoverFilterQuestionIcon("Sensitive");
  await page.waitForTimeout(300);

  // Verify the tooltip/callout is visible
  await filterPanel.expectFilterTooltipVisible(
    "Sensitive",
    "Pages with",
    "meadow-sensitive: true",
  );

  await addKeyFrame(callout);
  await addKeyFrame(sensitive);
  await snapshot("sensitive filter callout tooltip visible");
  void bigSite;

  await assertMeadowHomeState();
});
