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
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, htmlGeneration, customize, changesTab as changesTabDoc, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`HTML section changes filter correctly reflects changes after save and customization`);

const description = linkedScenarioDescription(conceptText`Save a generated bundle and customize its HTML output. The section-change filter should
distinguish the resulting changes from the saved baseline.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Navigate to big bundle preview (starts on step 1 — Review)` },
  checkInitialChangeCount: { type: 'test', text: conceptText`Check the initial change count.` },
  saveGeneratedVersion: { type: 'test', text: conceptText`Save the generated version.` },
  returnReview: { type: 'test', text: conceptText`Return to review.` },
  checkChangesAreCleared: { type: 'test', text: conceptText`Check that the changes are cleared.` },
  disableBreadcrumbs: { type: 'test', text: conceptText`Disable breadcrumbs.` },
  waitForRegeneratedOutput: { type: 'test', text: conceptText`Wait for the regenerated output.` },
  changesTabIndicatorShouldShowPositiveNumber: { type: 'test', text: conceptText`Changes tab indicator should show a positive number again` },
  inspectModifiedFiles: { type: 'test', text: conceptText`Inspect the modified files.` },
  onlyModifiedFilesShouldBeShownNo: { type: 'test', text: conceptText`Only modified files should be shown (no new or deleted)` },
  openSectionFilter: { type: 'test', text: conceptText`Open the section filter.` },
  checkWhichSectionChanged: { type: 'test', text: conceptText`Check which section changed.` },
});
const areas = scenarioAreas([bundleReview], { subAreas: [changesTabDoc] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e5b729ec-8d8d-4a05-acad-1822d0cc963c' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const { modal, changesTab } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundlePreview());
    const modal = new PreviewPublishModal(page, expect);
    const changesTab = new ChangesTab(page, expect);
    await sourceCommand(() => checkpoint("step 1 - preview loaded"));
    return { modal, changesTab };
  });

  await test.step(sections.steps.checkInitialChangeCount, async () => {
    await sourceCommand(() => changesTab.expectBadgeVisible());
    await sourceCommand(() => checkpoint("changes tab has positive badge"));
  });

  await test.step(sections.steps.saveGeneratedVersion, async () => {
    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => checkpoint("save completed - on step 2"));
  });

  await test.step(sections.steps.returnReview, async () => {
    await sourceCommand(() => modal.clickStep1Review());
    await sourceCommand(() => checkpoint("back on step 1"));
  });

  await test.step(sections.steps.checkChangesAreCleared, async () => {
    await sourceCommand(() => changesTab.expectNoBadge());
    await sourceCommand(() => addKeyFrame(htmlGeneration));
    await sourceCommand(() => checkpoint("changes tab has no badge after save"));
  });

  await test.step(sections.steps.disableBreadcrumbs, async () => {
    await sourceCommand(() => modal.openCustomizeSidebar());
    const customizeTab = new CustomizeTab(page, expect);
    await sourceCommand(() => customizeTab.generationOptions.disableBreadcrumbs());
    await sourceCommand(() => checkpoint("breadcrumbs disabled at bundle level"));
  });

  await test.step(sections.steps.waitForRegeneratedOutput, async () => {
    await sourceCommand(() => changesTab.waitForRegenerationComplete());
  });

  await test.step(sections.steps.changesTabIndicatorShouldShowPositiveNumber, async () => {
    await sourceCommand(() => changesTab.expectBadgeVisible());
    await sourceCommand(() => checkpoint("changes tab has badge after customization change"));
  });

  await test.step(sections.steps.inspectModifiedFiles, async () => {
    await sourceCommand(() => modal.clickChangesTab());
  });

  await test.step(sections.steps.onlyModifiedFilesShouldBeShownNo, async () => {
    await sourceCommand(() => changesTab.expectOnlyModifiedFiles());
    await sourceCommand(() => checkpoint("only modified files in changes tab"));
  });

  await test.step(sections.steps.openSectionFilter, async () => {
    await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
    await sourceCommand(() => checkpoint("html section changes filter opened"));
  });

  await test.step(sections.steps.checkWhichSectionChanged, async () => {
    await sourceCommand(() => changesTab.expectOnlySectionsWithChanges(["<header>"]));
    await sourceCommand(() => addKeyFrame(customize));
    await sourceCommand(() => addKeyFrame(changesTabDoc));
    await sourceCommand(() => checkpoint("only header section has changes"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
