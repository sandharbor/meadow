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
import { scenarioSections, findInBundles, archived, multiBundle, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundles } from "../../../concepts/index.js";
import { bigBundle, smallBundle, exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`find in bundles shows archived match indicator and archived tab`);

const description = linkedScenarioDescription(conceptText`Find a page that also belongs to an archived bundle. The search should identify the
archived match and open it through the archived list.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle list with example bundle added.` },
  archiveBigBundle: { type: 'test', text: conceptText`Archive the big bundle.` },
  findSharedPageSmallBundle: { type: 'test', text: conceptText`Find the shared page from the small bundle.` },
  switchListViewRightClickT001Deeply: { type: 'test', text: conceptText`Switch to list view and right-click "t001 - deeply nested"` },
  clickFindInBundlesContextMenu: { type: 'test', text: conceptText`Click "Find in Bundles" from the context menu` },
  shouldBeBackAtBundleListFind: { type: 'test', text: conceptText`Should be back at bundle list with find-in-bundles filter active` },
  onlySmallBundleShouldBeInMain: { type: 'test', text: conceptText`Only the small bundle should be in the main (current) list — the example bundle is filtered out because it doesn't track this page` },
  checkArchivedMatchCount: { type: 'test', text: conceptText`Check the archived match count.` },
  openArchivedMatches: { type: 'test', text: conceptText`Open the archived matches.` },
  clearPageFilterClearingFindInBundles: { type: 'test', text: conceptText`Clear the page filter. Clearing Find in Bundles ends the mode instead of offering to apply the same filter a second time.` },
});
const areas = scenarioAreas([bundles]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2d70b840-01c1-47ff-9364-c778fb4646f9' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
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

  await test.step(sections.steps.archiveBigBundle, async () => {
    await sourceCommand(() => bundleList.archiveBundle(Bundle.Big));
    await sourceCommand(() => page.waitForTimeout(500));
    await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Big));
    await sourceCommand(() => checkpoint("big bundle archived"));
  });

  await test.step(sections.steps.findSharedPageSmallBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle(Bundle.Small));
    await sourceCommand(() => editor.waitForLoad(Bundle.Small));
  });

  await test.step(sections.steps.switchListViewRightClickT001Deeply, async () => {
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => editor.rightClickRow("t001 - deeply nested"));
  });

  await test.step(sections.steps.clickFindInBundlesContextMenu, async () => {
    await sourceCommand(() => editor.clickFindInBundles());
    await sourceCommand(() => page.waitForTimeout(500));
  });

  await test.step(sections.steps.shouldBeBackAtBundleListFind, async () => {
    await sourceCommand(() => bundleList.expectHeadingVisible());
    await sourceCommand(() => bundleList.expectFindInBundlesFilterActive("t001 - deeply nested"));
  });

  await test.step(sections.steps.onlySmallBundleShouldBeInMain, async () => {
    await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Small));
    await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Big));
    await sourceCommand(() => bundleList.expectBundleNotVisible(Bundle.Example));
    await sourceCommand(() => addKeyFrame(findInBundles));
    await sourceCommand(() => addKeyFrame(multiBundle));
    await sourceCommand(() => checkpoint("current tab shows only small bundle"));
  });

  await test.step(sections.steps.checkArchivedMatchCount, async () => {
    await sourceCommand(() => bundleList.expectArchivedTabBadge(1));
    await sourceCommand(() => checkpoint("archived tab badge shows 1 match"));
  });

  await test.step(sections.steps.openArchivedMatches, async () => {
    await sourceCommand(() => bundleList.clickArchivedTab());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => bundleList.expectBundleVisible(Bundle.Big));
    await sourceCommand(() => addKeyFrame(archived));
    await sourceCommand(() => checkpoint("archived tab shows big bundle match"));
  });

  await test.step(sections.steps.clearPageFilterClearingFindInBundles, async () => {
    await sourceCommand(() => bundleList.clearFindInBundlesFilter("t001 - deeply nested"));
    await sourceCommand(() => bundleList.expectFindInBundlesFilterCleared("t001 - deeply nested"));
    await sourceCommand(() => checkpoint("find in bundles cleared"));
  });

  void bigBundle;
  void smallBundle;
  void exampleBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
