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
import { scenarioSections, versioning, frozenVersion, restoringFrozenVersion, externalFileEdits, dataIntegrity, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview } from "../../../concepts/index.js";
import { smallBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

const name = linkedScenarioName(conceptText`V08 G05 generated version frozen integrity is recoverable before canceling an unsaved successor`);

const description = linkedScenarioDescription(conceptText`Check ${conceptLink(dataIntegrity.id, 'data integrity')} after ${conceptLink(externalFileEdits.id, 'editing files outside Meadow')}: directly alter an HTML file inside a ${conceptLink(frozenVersion.id, 'frozen version')}'s saved output directory in Meadow Home.
Use ${conceptLink(restoringFrozenVersion.id, 'restoring a frozen version')} to recover its saved contents from Git, then cancel the unsaved successor and return to the original current version.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Save the initial generated version, then create an unsaved successor, leaving the saved predecessor as a ${conceptLink(frozenVersion.id, 'frozen version')}.` },
  modifyFrozenFilesOutsideMeadow: { type: 'test', text: conceptText`Use ${conceptLink(externalFileEdits.id, 'editing files outside Meadow')} to append an HTML comment to a file within the ${conceptLink(frozenVersion.id, 'frozen version')}'s output directory in Meadow Home.` },
  reviewIntegrityProblem: { type: 'test', text: conceptText`Return to Versions to refresh the ${conceptLink(dataIntegrity.id, 'data integrity')} check. Verify that Meadow reports an Integrity Problem and identifies the frozen version as modified locally.` },
  restoreFrozenVersion: { type: 'test', text: conceptText`Use ${conceptLink(restoringFrozenVersion.id, 'restoring a frozen version')} to replace the altered file with its saved Git contents and clear the integrity problem.` },
  cancelUnsavedSuccessor: { type: 'test', text: conceptText`Cancel the unsaved successor and verify that the original predecessor is current again.` },
});
const areas = scenarioAreas([bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2a0ec475-6a37-4886-93a7-e7dd9759e05e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const { modal, versions, initialVersion, successor } = await test.step(sections.steps.setup, async () => {
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
    return { modal, versions, initialVersion, successor };
  });

  const { frozenHtmlFile } = await test.step(sections.steps.modifyFrozenFilesOutsideMeadow, async () => {
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
    return { frozenHtmlFile };
  });

  await test.step(sections.steps.reviewIntegrityProblem, async () => {
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => modal.clickVersionsTab());

    await sourceCommand(() => expect(page.getByText("Integrity Problem", { exact: true })).toBeVisible());
    await sourceCommand(() => expect(page.getByText("Frozen version modified locally", { exact: true })).toBeVisible());
    await sourceCommand(() => addKeyFrame(versioning, frozenVersion, externalFileEdits, dataIntegrity));
    await sourceCommand(() => checkpoint("frozen integrity problem blocks version workflow"));
  });

  await test.step(sections.steps.restoreFrozenVersion, async () => {
    await sourceCommand(() => page.getByRole("button", { name: "Restore Frozen Version from Git" }).click());
    await sourceCommand(() => expect(page.getByTestId("version-card")
      .filter({ hasText: initialVersion.versionId })
      .getByRole("button", { name: "Delete Local Files", exact: true })).toBeEnabled());
    await sourceCommand(() => expect(page.getByText("Integrity Problem", { exact: true })).toHaveCount(0));
    expect(fs.readFileSync(frozenHtmlFile, "utf8")).not.toContain("injected frozen edit");

    await sourceCommand(() => addKeyFrame(restoringFrozenVersion));
    await sourceCommand(() => checkpoint("restoring from Git removes the frozen integrity problem"));
  });

  await test.step(sections.steps.cancelUnsavedSuccessor, async () => {
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
  });

  void smallBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
