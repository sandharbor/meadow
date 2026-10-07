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

import fs from "fs";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { ChangesTab, CustomizeTab, PreviewPublishModal } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { versioning, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { smallBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

const name = linkedScenarioName(conceptText`V08 G05 generated version frozen integrity is recoverable before canceling an unsaved successor`);

const description = linkedScenarioDescription(conceptText`Modify a frozen version's files outside Meadow. Restore them from Git, then cancel the
unsaved successor and return to the original current version.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2a0ec475-6a37-4886-93a7-e7dd9759e05e' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToSmallBundlePreview());

  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Small);
  const initialVersion = await sourceCommand(() => versions.waitForOnlyVersion());

  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.clickStep1Review());
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  await sourceCommand(() => customizeTab.generationOptions.disableBreadcrumbs());
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => modal.openCreateNewVersionDialog());
  await sourceCommand(() => modal.createConnectedVersion("Recoverable successor"));
  await sourceCommand(() => modal.expectVersionsTabActive());
  await sourceCommand(() => modal.expectVersionCreatedMessageHidden());

  const [, successor] = await sourceCommand(() => versions.waitForCount(2));
  await sourceCommand(() => checkpoint("a successor exists alongside its frozen predecessor"));

  // --- Test start ---
  // Modify the frozen files outside Meadow.
  const frozenDirectory = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Small,
    "html",
    "generated_bundle_versions",
    initialVersion.versionId,
  );
  const frozenHtmlPath = fs.readdirSync(frozenDirectory, { recursive: true, encoding: "utf8" })
    .find(relativePath => relativePath.endsWith(".html"));
  expect(frozenHtmlPath).toBeTruthy();
  const frozenHtmlFile = path.join(frozenDirectory, frozenHtmlPath!);
  fs.appendFileSync(frozenHtmlFile, "\n<!-- injected frozen edit -->\n");

  // The test changes the filesystem behind the UI's back, so remount the
  // Versions tab to trigger the same integrity refresh as returning to it.
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => modal.clickVersionsTab());

  await sourceCommand(() => expect(page.getByText("Integrity Problem", { exact: true })).toBeVisible());
  await sourceCommand(() => expect(page.getByText("Frozen version modified locally", { exact: true })).toBeVisible());
  await sourceCommand(() => addKeyFrame(versioning));
  await sourceCommand(() => checkpoint("frozen integrity problem blocks version workflow"));

  // Restore the frozen version.
  await sourceCommand(() => page.getByRole("button", { name: "Restore Frozen Version from Git" }).click());
  await sourceCommand(() => expect(page.getByText("Integrity Problem", { exact: true })).toHaveCount(0));
  expect(fs.readFileSync(frozenHtmlFile, "utf8")).not.toContain("injected frozen edit");

  await sourceCommand(() => checkpoint("restoring from Git removes the frozen integrity problem"));

  // Cancel the unsaved successor.
  await sourceCommand(() => modal.cancelCurrentVersion());
  await sourceCommand(() => expect(page.getByText(successor.versionId, { exact: true })).toHaveCount(0, { timeout: 30_000 }));
  await sourceCommand(() => modal.expectSingleVersionExplanation());
  await sourceCommand(() => expect(page.getByText(initialVersion.versionId, { exact: true })).toHaveCount(0));
  const restoredCurrent = await sourceCommand(() => versions.waitForOnlyVersion());
  expect(restoredCurrent).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "current",
  });
  await sourceCommand(() => checkpoint("unsaved successor canceled after integrity recovery"));

  void smallBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
