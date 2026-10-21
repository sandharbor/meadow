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
import { BundleEditorPage, BundleListPage } from "../src/run/pages/index.js";
import { scenarioSections, sourcingReviewRedesign, blacklist, folderBundles, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { Bundle, Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "multiple-folders" });
test.use({ fixtureHome: Fixture.FolderStructureMultiple });

const name = linkedScenarioName(conceptText`a collection member folder can be blacklisted and restored`);

const description = linkedScenarioDescription(conceptText`Blacklist one folder in a collection and inspect the reduced graph. Removing the
blacklist should restore its descendants and reachable pages.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the full folder graph contains eleven pages.` },
  blacklistAlphaFolder: { type: 'test', text: conceptText`Blacklist the Alpha folder.` },
  restoreFolder: { type: 'test', text: conceptText`Restore the folder.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '65e907d8-cdfb-4082-8465-601adb3f75bc' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);

    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.clickBundle(Bundle.FolderStructureMultiple));
    await sourceCommand(() => editor.waitForLoad(Bundle.FolderStructureMultiple));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(11));

    await sourceCommand(() => checkpoint("the full folder graph contains eleven pages"));
    return { editor };
  });

  await test.step(sections.steps.blacklistAlphaFolder, async () => {
    await sourceCommand(() => editor.clickListViewRowByNodeKey("folder:Alpha"));
    await sourceCommand(() => editor.expectSelectedPageBadge("folder:Alpha", "Tracked"));
    await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
    await sourceCommand(() => editor.clickContextMenuItem("Blacklist"));
    await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
    await sourceCommand(() => checkpoint("folder boundary and departing descendants await acceptance"));
    await sourceCommand(() => editor.sourceReview.accept());

    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(4));
    await sourceCommand(() => editor.expectSelectedPageBadge("folder:Alpha", "Blacklisted"));
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Alpha"));
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta"));
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent("Beta note"));
    for (const removedTitle of [
      "Alpha note",
      "Visual map",
      "Nested",
      "Nested note",
      "Outside note",
      "Beyond outside",
      "Frontier image",
    ]) {
      await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(removedTitle));
    }
    await sourceCommand(() => addKeyFrame(folderBundles));
    await sourceCommand(() => addKeyFrame(blacklist));
    await sourceCommand(() => checkpoint("Alpha folder blacklist hides its working-graph subtree"));
  });

  await test.step(sections.steps.restoreFolder, async () => {
    await sourceCommand(() => editor.rightClickListViewRowByNodeKey("folder:Alpha"));
    await sourceCommand(() => editor.clickContextMenuItem("Remove from Blacklist"));
    await sourceCommand(() => expect(editor.sourceReview.root).toBeVisible());
    await sourceCommand(() => editor.sourceReview.accept());

    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(11));
    for (const restoredTitle of [
      "Alpha",
      "Alpha note",
      "Visual map",
      "Nested",
      "Nested note",
      "Outside note",
      "Beyond outside",
      "Frontier image",
    ]) {
      await sourceCommand(() => editor.expectListViewRowByExactNamePresent(restoredTitle));
    }
    await sourceCommand(() => checkpoint("removing the Alpha folder blacklist restores its descendants"));
  });

  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ["bundles/ordered-folders/raw/folder_scope_snapshot.json"],
  }));
});
