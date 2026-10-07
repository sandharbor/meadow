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
import { callout, sensitive, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Callout tooltip shown when hovering sensitive filter question mark`);

const description = linkedScenarioDescription(conceptText`Hover over the sensitive filter's help icon. Its callout should explain which pages the
filter includes.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd7b5274b-db40-4d62-a90d-228408b96202' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // --- Test start ---
  // Enable the sensitive filter.
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.enableFilter("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("sensitive filter enabled"));

  // Read the filter explanation.
  await sourceCommand(() => filterPanel.hoverFilterQuestionIcon("Sensitive"));
  await sourceCommand(() => page.waitForTimeout(300));

  // Verify the tooltip/callout is visible
  await sourceCommand(() => filterPanel.expectFilterTooltipVisible(
    "Sensitive",
    "Pages with",
    "meadow-sensitive: true",
  ));

  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint("sensitive filter callout tooltip visible"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
