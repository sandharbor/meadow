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
import { Workflows, Bundle } from "../src/run/workflows.js";
import { scenarioSections, multiBundle, findInBundles, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundles } from "../../../concepts/index.js";
import { bigBundle, smallBundle, exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`find in bundles navigates from small bundle to big bundle with page auto-selected`);

const description = linkedScenarioDescription(conceptText`Find a page shared by the small and big bundles. Opening the other match should select
that page in the destination bundle.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle list with example bundle added.` },
  openSmallBundle: { type: 'test', text: conceptText`Open the small bundle.` },
  openSharedPageMenu: { type: 'test', text: conceptText`Open the shared page menu.` },
  findPageInOtherBundles: { type: 'test', text: conceptText`Find the page in other bundles.` },
  shouldBeBackAtBundleListFind: { type: 'test', text: conceptText`Should be back at bundle list with find-in-bundles filter active` },
  checkMatchingBundlesBothBigSmallShould: { type: 'test', text: conceptText`Check the matching bundles. Both Big and Small should be visible (both track this page), but the example bundle should be filtered out` },
  clickOnBigBundle: { type: 'test', text: conceptText`Click on the big bundle` },
  checkAutomaticSelection: { type: 'test', text: conceptText`Check the automatic selection.` },
  soloSelectedPagesIsolateFoundPage: { type: 'test', text: conceptText`Solo the selected pages to isolate the found page` },
  inspectFoundPageInListView: { type: 'test', text: conceptText`Inspect the found page in list view.` },
});
const areas = scenarioAreas([bundles]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f1f1b810-8fb1-40d2-8c0c-108081f4e876' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const { bundleList, editor } = await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    const bundleList = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);

    // Add the example bundle so the bundle list has more entries, making the
    // find-in-bundles filtering more visually obvious.
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.addExampleBundleFromMenu());
    await sourceCommand(() => editor.waitForLoad(Bundle.Example));
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Example));
    await sourceCommand(() => checkpoint("bundle list with example bundle added"));
    return { bundleList, editor };
  });

  await test.step(sections.steps.openSmallBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle(Bundle.Small));
    await sourceCommand(() => editor.waitForLoad(Bundle.Small));
    await sourceCommand(() => checkpoint("small bundle loaded"));
  });

  await test.step(sections.steps.openSharedPageMenu, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));
    await sourceCommand(() => checkpoint("context menu open on t001"));
  });

  await test.step(sections.steps.findPageInOtherBundles, async () => {
    await sourceCommand(() => editor.clickFindInBundles());
    await sourceCommand(() => page.waitForTimeout(500));
  });

  await test.step(sections.steps.shouldBeBackAtBundleListFind, async () => {
    await sourceCommand(() => bundleList.expectHeadingVisible());
    await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));
    await sourceCommand(() => checkpoint("bundle list with find in bundles filter active"));
  });

  await test.step(sections.steps.checkMatchingBundlesBothBigSmallShould, async () => {
    await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Big));
    await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Small));
    await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Example));
    await sourceCommand(() => addKeyFrame(findInBundles));
    await sourceCommand(() => addKeyFrame(multiBundle));
  });

  await test.step(sections.steps.clickOnBigBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle(Bundle.Big));
    await sourceCommand(() => editor.waitForLoad(Bundle.Big));
    await sourceCommand(() => page.waitForTimeout(500));
    await sourceCommand(() => checkpoint("big bundle loaded with auto-selected page"));
  });

  await test.step(sections.steps.checkAutomaticSelection, async () => {
    const selectedTitles = await sourceCommand(() => editor.getSelectedPageTitles());
    expect(selectedTitles).toContain("t001 - deeply nested");
  });

  await test.step(sections.steps.soloSelectedPagesIsolateFoundPage, async () => {
    await sourceCommand(() => editor.clickSoloSelection());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("solo mode with found page"));
  });

  await test.step(sections.steps.inspectFoundPageInListView, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
    const listCount = await sourceCommand(() => editor.getListViewPageCount());
    expect(listCount).toBe(1);
    await sourceCommand(() => checkpoint("list view showing only the found page"));
  });

  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
