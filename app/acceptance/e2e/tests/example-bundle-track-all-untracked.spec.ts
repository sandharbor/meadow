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
import { tracking, sensitive, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`Track All on example bundle untracked pages auto-saves without a save click`);

const description = linkedScenarioDescription(conceptText`Select all untracked pages in the example bundle and track them. The operation should
save automatically without an extra Save click.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f7ebd9d2-d561-4f63-95f4-0e08e6dfdfe4' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  // Add the example bundle from the empty state
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));
  await sourceCommand(() => checkpoint("example bundle loaded"));

  // --- Test start ---
  // Select the safe pages.
  await sourceCommand(() => editor.expectUndoNotVisible());

  // Select all pages — this opens the selection sidebar and reveals the
  // bulk action buttons.
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(500));

  // Deselect sensitive pages. The example bundle ships with sensitive pages
  // the user hasn't yet acknowledged, so Track All is disabled until they
  // are removed from the selection.
  await sourceCommand(() => editor.clickDeselectSensitivePagesIfVisible());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint("sensitive pages deselected"));

  // Track the selected pages.
  // Track All is a "simple op": it auto-saves the config and commits in a
  // single request. The Save/Undo buttons must never appear — tracking a
  // batch of pages shouldn't feel like "make-work" to the user.
  await sourceCommand(() => editor.clickTrackAll());
  await sourceCommand(() => editor.expectUndoNotVisible());
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("track all applied — no save button"));

  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
