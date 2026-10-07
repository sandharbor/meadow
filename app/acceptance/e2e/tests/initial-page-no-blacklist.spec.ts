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
import { BundleListPage, BundleEditorPage } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { initialPage, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle, exampleBundleInitialPageTitle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`a publisher should not be able to blacklist the initial page`);

const description = linkedScenarioDescription(conceptText`Select the bundle's starting page and inspect its actions. Meadow should prevent
blacklisting the page that anchors the bundle.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '4cf8d25d-1de3-4074-a122-225250114627' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, assertMeadowHomeState, addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle and switch to list view
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));

  // Right-click the initial page — Blacklist should NOT appear
  await sourceCommand(() => editor.rightClickRow(exampleBundleInitialPageTitle));
  await sourceCommand(() => editor.expectContextMenuItemNotVisible("Blacklist"));
  await sourceCommand(() => addKeyFrame(initialPage));
  await sourceCommand(() => checkpoint("initial page context menu has no blacklist"));

  // --- Test start ---
  // Compare a regular page.
  await sourceCommand(() => page.keyboard.press("Escape"));

  // Right-click a non-initial page — Blacklist SHOULD appear
  await sourceCommand(() => editor.rightClickRow("Cognitive Biases"));
  await sourceCommand(() => editor.expectContextMenuItemVisible("Blacklist"));
  await sourceCommand(() => checkpoint("non-initial page context menu has blacklist"));

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
