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

import path from 'node:path';
import { sourceSensitivity } from '../src/run/utils/sourceSensitivity.js';
import { test, expect } from "../src/run/test-fixtures.js";
import { BundleEditorPage, FilterPanelComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, callout, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration, bundleSourcing, sensitive } from "../../../concepts/index.js";
import { scenarioDesignPressures, preventAccidentalSharing } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`callout for marking source node sensitive the first time`);

const description = linkedScenarioDescription(conceptText`Mark a page as sensitive for the first time. Check that the introductory callout
explains the source change and can be dismissed.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle editor loaded.` },
  markFirstPageSensitive: { type: 'test', text: conceptText`Mark the first page sensitive.` },
  switchListViewSoWeCanReliably: { type: 'test', text: conceptText`Switch to list view so we can reliably target a specific non-sensitive page` },
  rightClickOnNonSensitivePageGet: { type: 'test', text: conceptText`Right-click on a non-sensitive page to get the context menu` },
  chooseMarkSensitiveContextMenu: { type: 'test', text: conceptText`Choose "Mark Sensitive" from the context menu` },
  shouldSeeConsentModalHeadsUpSince: { type: 'test', text: conceptText`Should see the consent modal ("Heads Up") since this is the first time` },
  acceptExplanation: { type: 'test', text: conceptText`Accept the explanation.` },
  markAnotherPageSensitive: { type: 'test', text: conceptText`Mark another page sensitive.` },
  chooseMarkSensitiveAgain: { type: 'test', text: conceptText`Choose "Mark Sensitive" again` },
  noConsentModalThisTimeDismissalPersisted: { type: 'test', text: conceptText`No consent modal this time - the dismissal persisted` },
  acceptInspectSensitivePages: { type: 'test', text: conceptText`Accept and inspect the sensitive pages.` },
  soloSensitivePages: { type: 'test', text: conceptText`Solo the sensitive pages` },
  selectAllVerifyPagesWeJustMarked: { type: 'test', text: conceptText`Select all and verify 3 pages (the 2 we just marked + the page that is already sensitive in the source fixture).` },
  removeSolo: { type: 'test', text: conceptText`Remove the solo.` },
  removeBothSensitivityMarkingsNowMarkThose: { type: 'test', text: conceptText`Remove both sensitivity markings. Now mark those two pages as not sensitive via right-click First page` },
  secondPage: { type: 'test', text: conceptText`Second page` },
  acceptEditsInspectRemainingPage: { type: 'test', text: conceptText`Accept the edits and inspect the remaining page.` },
  soloSensitivePagesAgainSelectAllSource: { type: 'test', text: conceptText`Solo sensitive pages again, select all - the source-sensitive page remains.` },
});
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
const areas = scenarioAreas([bundleCuration, bundleSourcing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b6df7a57-471f-4913-be4a-30eb32c38735' }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const { sourceFile, markedNames } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundle());
    await sourceCommand(() => checkpoint("bundle editor loaded"));

    const sourceFile = (name: string) => path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data', `${name}.md`);
    const markedNames = ['t002 - dup pages and images', 't005 - in and out links'];
    for (const name of markedNames) expect(sourceSensitivity(sourceFile(name))).toBeUndefined();
    return { sourceFile, markedNames };
  });

  const { editor } = await test.step(sections.steps.markFirstPageSensitive, async () => {
    const editor = new BundleEditorPage(page, expect);
    return { editor };
  });

  await test.step(sections.steps.switchListViewSoWeCanReliably, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
  });

  await test.step(sections.steps.rightClickOnNonSensitivePageGet, async () => {
    await sourceCommand(() => editor.rightClickRow("t002 - dup pages and images"));
  });

  await test.step(sections.steps.chooseMarkSensitiveContextMenu, async () => {
    await sourceCommand(() => editor.clickMarkSensitive());
  });

  await test.step(sections.steps.shouldSeeConsentModalHeadsUpSince, async () => {
    await sourceCommand(() => editor.expectConsentModalVisible());
    await sourceCommand(() => addKeyFrame(callout));
    await sourceCommand(() => checkpoint("consent modal visible for first sensitive marking"));
  });

  await test.step(sections.steps.acceptExplanation, async () => {
    await sourceCommand(() => editor.clickConsentProceed());
    await sourceCommand(() => page.waitForTimeout(500));
    await expect.poll(() => sourceSensitivity(sourceFile(markedNames[0]))).toBe(true);
    await sourceCommand(() => checkpoint("first page marked sensitive in source YAML front matter"));
  });

  await test.step(sections.steps.markAnotherPageSensitive, async () => {
    await sourceCommand(() => editor.rightClickRow("t005 - in and out links"));
  });

  await test.step(sections.steps.chooseMarkSensitiveAgain, async () => {
    await sourceCommand(() => editor.clickMarkSensitive());
    await sourceCommand(() => page.waitForTimeout(500));
  });

  await test.step(sections.steps.noConsentModalThisTimeDismissalPersisted, async () => {
    await sourceCommand(() => editor.expectConsentModalNotVisible());
    await expect.poll(() => sourceSensitivity(sourceFile(markedNames[1]))).toBe(true);
    await sourceCommand(() => checkpoint("second page marked sensitive without consent modal"));
  });

  await test.step(sections.steps.acceptInspectSensitivePages, async () => {
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.reviewTrackingChoices(2));
    for (const name of markedNames) {
      await sourceCommand(() => editor.sourceReview.resolveSensitiveTracking(name, true));
    }
    await sourceCommand(() => editor.sourceReview.accept());
  });

  const { filterPanel } = await test.step(sections.steps.soloSensitivePages, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
    await sourceCommand(() => page.waitForTimeout(250));
    return { filterPanel };
  });

  await test.step(sections.steps.selectAllVerifyPagesWeJustMarked, async () => {
    await sourceCommand(() => editor.clickSelectAll());
    await sourceCommand(() => page.waitForTimeout(250));
    const selectedTitles = await sourceCommand(() => editor.getSelectedPageTitles());
    expect(selectedTitles.sort()).toEqual([...markedNames, 't004 ---- sensitive page'].sort());
    await sourceCommand(() => addKeyFrame(sensitive));
    await sourceCommand(() => checkpoint("3 sensitive pages selected after solo"));
  });

  await test.step(sections.steps.removeSolo, async () => {
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("solo removed"));
  });

  await test.step(sections.steps.removeBothSensitivityMarkingsNowMarkThose, async () => {
    await sourceCommand(() => editor.rightClickRow("t002 - dup pages and images"));
    await sourceCommand(() => editor.clickMarkNotSensitive());
    await sourceCommand(() => page.waitForTimeout(500));
  });

  await test.step(sections.steps.secondPage, async () => {
    await sourceCommand(() => editor.rightClickRow("t005 - in and out links"));
    await sourceCommand(() => editor.clickMarkNotSensitive());
    await sourceCommand(() => page.waitForTimeout(500));
    for (const name of markedNames) await expect.poll(() => sourceSensitivity(sourceFile(name))).toBeUndefined();
    await sourceCommand(() => checkpoint("two pages unmarked and their source YAML sensitivity removed"));
  });

  await test.step(sections.steps.acceptEditsInspectRemainingPage, async () => {
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.accept());
  });

  await test.step(sections.steps.soloSensitivePagesAgainSelectAllSource, async () => {
    await sourceCommand(() => filterPanel.clickSoloOnFilter("Sensitive"));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => editor.clickSelectAll());
    await sourceCommand(() => page.waitForTimeout(250));
    const selectedTitlesAfter = await sourceCommand(() => editor.getSelectedPageTitles());
    expect(selectedTitlesAfter).toEqual(['t004 ---- sensitive page']);
    expect(sourceSensitivity(sourceFile('t004 ---- sensitive page'))).toBe(true);
    await sourceCommand(() => addKeyFrame(sensitive));
    await sourceCommand(() => checkpoint("1 sensitive page remaining after unmarking two"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
