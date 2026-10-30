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
import {
  BundleEditorPage,
  PreviewPublishModal,
  ChangesTab,
  FilterPanelComponent,
  SelectedPageDetailComponent,
  ActionButton,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, filters, htmlGeneration, changesTab as changesTabDoc, tracking, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Change type filter shows correct counts and interacts with HTML section filter`);

const description = linkedScenarioDescription(conceptText`Generate and save a bundle, then change its output. Check that change-type counts and
HTML-section filters stay consistent throughout the review.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: changes tab showing only new files.` },
  inspectChangeCounts: { type: 'test', text: conceptText`Inspect the change counts.` },
  hideAddedFiles: { type: 'test', text: conceptText`Hide added files.` },
  restoreAddedFilesSave: { type: 'test', text: conceptText`Restore added files and save.` },
  inspectSavedChangeCounts: { type: 'test', text: conceptText`Inspect the saved change counts.` },
  trackAnotherPage: { type: 'test', text: conceptText`Track another page.` },
  soloUntrackedFilterSeeOnlyUntrackedPages: { type: 'test', text: conceptText`Solo the Untracked filter to see only untracked pages` },
  clickOnSensitivePageRowSelectIt: { type: 'test', text: conceptText`Click on the "004 - sensitive" page row to select it` },
  trackItViaSelectedPageDetailPanel: { type: 'test', text: conceptText`Track it via the selected page detail panel` },
  trackingPageSimpleOpAutoSavesCommits: { type: 'test', text: conceptText`Tracking a page is a "simple op" that auto-saves + commits — no Save click needed.` },
  previewNewSelection: { type: 'test', text: conceptText`Preview the new selection.` },
  inspectMixedChanges: { type: 'test', text: conceptText`Inspect the mixed changes.` },
  trackingPageAddsHTMLSearchShardContent: { type: 'test', text: conceptText`Tracking the page adds its HTML, a search shard, and a content-addressed reader route index. It replaces the previous route index, and also modifies the main page, search manifest, and main page's search shard.` },
  shouldSeeChangesInMainSection: { type: 'test', text: conceptText`Should see 2 changes in the <main> section` },
  hideModifiedFiles: { type: 'test', text: conceptText`Hide modified files.` },
});
const areas = scenarioAreas([bundleReview], { subAreas: [changesTabDoc] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e141c6a7-5f95-4f01-a45c-05bd2c17322f' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const { modal, changesTab } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundlePreview());
    const modal = new PreviewPublishModal(page, expect);
    const changesTab = new ChangesTab(page, expect);

    await sourceCommand(() => changesTab.expectBadgeVisible());
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changesTab.expectOnlyNewFiles());
    await sourceCommand(() => checkpoint("changes tab showing only new files"));
    return { modal, changesTab };
  });

  const { addedCount } = await test.step(sections.steps.inspectChangeCounts, async () => {
    await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
    const addedCount = await sourceCommand(() => changesTab.getChangeTypeCount("Added"));
    expect(addedCount).toBeGreaterThan(0);
    await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 0));
    await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 0));
    await sourceCommand(() => checkpoint("filter shows only added files with positive count"));
    return { addedCount };
  });

  await test.step(sections.steps.hideAddedFiles, async () => {
    await sourceCommand(() => changesTab.uncheckChangeType("Added"));
    await sourceCommand(() => changesTab.expectNoVisibleHtmlSections());
    await sourceCommand(() => changesTab.expectHiddenCount(addedCount));
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => addKeyFrame(changesTabDoc));
    await sourceCommand(() => checkpoint("unchecked added - html sections hidden and hidden count matches"));
  });

  await test.step(sections.steps.restoreAddedFilesSave, async () => {
    await sourceCommand(() => changesTab.checkChangeType("Added"));

    await sourceCommand(() => modal.clickSaveChanges());
    await sourceCommand(() => modal.waitForSaveComplete());
    await sourceCommand(() => modal.clickStep1Review());
    await sourceCommand(() => changesTab.expectNoBadge());
    await sourceCommand(() => checkpoint("no badge after save"));
  });

  await test.step(sections.steps.inspectSavedChangeCounts, async () => {
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
    await sourceCommand(() => changesTab.expectChangeTypeCount("Added", 0));
    await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 0));
    await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 0));
    await sourceCommand(() => checkpoint("all change type counts zero after save"));
  });

  await test.step(sections.steps.trackAnotherPage, async () => {
    await sourceCommand(() => modal.closeModal());
  });

  const { editor } = await test.step(sections.steps.soloUntrackedFilterSeeOnlyUntrackedPages, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.enableAndSoloFilter("Untracked"));
    await sourceCommand(() => page.waitForTimeout(500));

    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
    return { editor };
  });

  await test.step(sections.steps.clickOnSensitivePageRowSelectIt, async () => {
    await sourceCommand(() => editor.clickListViewRowByName("t004 - sensitive"));
    await sourceCommand(() => page.waitForTimeout(250));
  });

  const { selectedPage } = await test.step(sections.steps.trackItViaSelectedPageDetailPanel, async () => {
    const selectedRoot = editor.getSelectedPageRoot();
    const selectedPage = new SelectedPageDetailComponent(selectedRoot, expect);
    return { selectedPage };
  });

  await test.step(sections.steps.trackingPageSimpleOpAutoSavesCommits, async () => {
    await sourceCommand(() => selectedPage.clickAction(ActionButton.Track, page));
    await sourceCommand(() => addKeyFrame(tracking));
    await sourceCommand(() => checkpoint("tracked sensitive page"));
  });

  await test.step(sections.steps.previewNewSelection, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => checkpoint("second preview after tracking new page"));
  });

  await test.step(sections.steps.inspectMixedChanges, async () => {
    await sourceCommand(() => modal.clickChangesTab());
    await sourceCommand(() => page.waitForTimeout(500));
  });

  await test.step(sections.steps.trackingPageAddsHTMLSearchShardContent, async () => {
    await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
    await sourceCommand(() => changesTab.expectChangeTypeCount("Added", 3));
    await sourceCommand(() => changesTab.expectChangeTypeCount("Modified", 3));
    await sourceCommand(() => changesTab.expectChangeTypeCount("Deleted", 1));
  });

  await test.step(sections.steps.shouldSeeChangesInMainSection, async () => {
    await sourceCommand(() => changesTab.expectSectionCount("<main>", 2));
    await sourceCommand(() => addKeyFrame(htmlGeneration));
    await sourceCommand(() => checkpoint("search-aware file totals and 2 main section changes"));
  });

  await test.step(sections.steps.hideModifiedFiles, async () => {
    await sourceCommand(() => changesTab.uncheckChangeType("Modified"));
    await sourceCommand(() => page.waitForTimeout(500));
    await sourceCommand(() => changesTab.expectSectionCount("<main>", 1));
    await sourceCommand(() => checkpoint("unchecked modified - main section drops to 1"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
