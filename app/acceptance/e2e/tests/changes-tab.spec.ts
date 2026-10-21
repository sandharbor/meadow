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
import { PreviewPublishModal, ChangesTab } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Workflows, Bundle } from "../src/run/workflows.js";
import { scenarioSections, htmlGeneration, changesTab as changesTabDoc, versioning, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

const name = linkedScenarioName(conceptText`V03 first generated version is reviewable before and after save`);

const description = linkedScenarioDescription(conceptText`Generate a bundle's first version and inspect its changes before saving. After saving,
the same review should show no outstanding changes.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Navigate to big bundle preview (starts on step 1 — Review)` },
  inspectInitialGeneratedVersion: { type: 'test', text: conceptText`Inspect the initial generated version.` },
  reviewNewFiles: { type: 'test', text: conceptText`Review the new files.` },
  changesTabBadgeShouldShowPositiveNumber: { type: 'test', text: conceptText`Changes tab badge should show a positive number (initial preview has new files)` },
  goChangesTabAssertOnlyNewFiles: { type: 'test', text: conceptText`Go to Changes tab — assert only new files (A indicators, no M or D)` },
  readFileDiff: { type: 'test', text: conceptText`Read the file diff.` },
  saveGeneratedVersion: { type: 'test', text: conceptText`Save the generated version.` },
  returnReview: { type: 'test', text: conceptText`Return to review.` },
  verifySavedVersionHasNoChanges: { type: 'test', text: conceptText`Verify the saved version has no changes.` },
  goChangesTabAssertNoChangedFiles: { type: 'test', text: conceptText`Go to Changes tab — assert "No changed files"` },
});
const areas = scenarioAreas([bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'cd2d2768-5c81-4558-8fbe-8dc5d4c5f09b' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const { modal, changesTab, versions } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundlePreview());
    const modal = new PreviewPublishModal(page, expect);
    const changesTab = new ChangesTab(page, expect);
    const versions = new GeneratedBundleVersions(page, expect, Bundle.Big);
    await sourceCommand(() => checkpoint("step 1 - preview loaded"));
    return { modal, changesTab, versions };
  });

  const { versionId } = await test.step(sections.steps.inspectInitialGeneratedVersion, async () => {
    await sourceCommand(() => modal.expectSaveChangesVisible());
    await sourceCommand(() => modal.expectCreateNewVersionHidden());

    const initialVersion = await sourceCommand(() => versions.waitForOnlyVersion());
    const versionId = initialVersion.versionId;
    expect(versionId).toMatch(/^v[A-Za-z0-9]{6}$/);
    expect(initialVersion).toMatchObject({ displayState: "unsaved", savedGenerationId: null });

    await sourceCommand(() => modal.clickVersionsTab());
    await sourceCommand(() => modal.expectSaveChangesHidden());
    await sourceCommand(() => modal.expectCreateNewVersionVisible());
    await sourceCommand(() => modal.expectSingleVersionExplanation());
    await sourceCommand(() => expect(page.getByText(versionId, { exact: true })).toHaveCount(0));
    await sourceCommand(() => addKeyFrame(versioning));
    await sourceCommand(() => checkpoint("first generated version shown as unsaved"));
    return { versionId };
  });

  await test.step(sections.steps.reviewNewFiles, async () => {
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => modal.expectSaveChangesVisible());
    await sourceCommand(() => modal.expectCreateNewVersionHidden());
  });

  await test.step(sections.steps.changesTabBadgeShouldShowPositiveNumber, async () => {
    await sourceCommand(() => changesTab.expectBadgeVisible());
  });

  await test.step(sections.steps.goChangesTabAssertOnlyNewFiles, async () => {
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changesTab.expectOnlyNewFiles());
    await sourceCommand(() => changesTab.expectFolderCollapsed("_mw_assets"));
    await sourceCommand(() => changesTab.expandFolder("_mw_assets"));
    await sourceCommand(() => changesTab.expectFolderCollapsed("index"));
    await sourceCommand(() => changesTab.expectSelectedFile("t001 ---- child 2.html"));
    await sourceCommand(() => checkpoint("only new files in changes tab"));
  });

  await test.step(sections.steps.readFileDiff, async () => {
    await sourceCommand(() => changesTab.fileDetails.ensureOnDiffTab());
    await sourceCommand(() => changesTab.fileDetails.clickCodeSubTab());
    await sourceCommand(() => changesTab.fileDetails.expectNewFileHeader());
    await sourceCommand(() => addKeyFrame(htmlGeneration));
    await sourceCommand(() => addKeyFrame(changesTabDoc));
    await sourceCommand(() => checkpoint("new file diff header shown"));
  });

  await test.step(sections.steps.saveGeneratedVersion, async () => {
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => modal.expectShareVersionSelectorHidden());
    await sourceCommand(() => checkpoint("save completed - on step 2"));
  });

  await test.step(sections.steps.returnReview, async () => {
    await sourceCommand(() => modal.clickStep1Review());
    await sourceCommand(() => checkpoint("back on step 1 after save"));
  });

  const { hooksReloaded } = await test.step(sections.steps.verifySavedVersionHasNoChanges, async () => {
    await sourceCommand(() => changesTab.expectNoBadge());

    await sourceCommand(() => modal.clickVersionsTab());
    await sourceCommand(() => modal.expectSingleVersionExplanation());
    await sourceCommand(() => expect(page.getByText(versionId, { exact: true })).toHaveCount(0));
    const hooksReloaded = page.waitForResponse(response =>
      response.request().method() === "GET"
        && new URL(response.url()).pathname.endsWith(
          "/api/bundles/meadow-test-bundle-big/generation/hooks",
        ),
    );
    await sourceCommand(() => modal.clickChangesTab());
    return { hooksReloaded };
  });

  await test.step(sections.steps.goChangesTabAssertNoChangedFiles, async () => {
    await sourceCommand(() => changesTab.expectNoChangedFiles());
    expect((await sourceCommand(() => hooksReloaded)).ok()).toBe(true);
    await sourceCommand(() => checkpoint("no changed files after save"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
