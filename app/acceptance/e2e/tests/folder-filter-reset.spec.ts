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
import { FilterPanelComponent, BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { scenarioSections, filters, folderFilter, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`folder filter exposes collapsed activity and reset restores all pages`);

const description = linkedScenarioDescription(conceptText`Hide a nested folder and collapse its parent. The parent should indicate the hidden
activity, and Reset should restore every page.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the unfiltered list is ready.` },
  hideNestedFolder: { type: 'test', text: conceptText`Hide a nested folder.` },
  resetFolderFilters: { type: 'test', text: conceptText`Reset the folder filters.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd05dc908-cb6a-4963-89c8-f1ec7b8a8bf9' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const { editor, filterPanel, initialPageCount } = await test.step(sections.steps.setup, async () => {
    const workflows = new Workflows(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const filterPanel = new FilterPanelComponent(page, expect);

    await sourceCommand(() => workflows.navigateToBigBundle());
    await sourceCommand(() => filterPanel.enableFilter("Folders"));
    await sourceCommand(() => editor.switchToListView());
    const initialPageCount = await sourceCommand(() => editor.getListViewPageCount());
    expect(initialPageCount).toBeGreaterThan(1);

    await sourceCommand(() => checkpoint("the unfiltered list is ready"));
    return { editor, filterPanel, initialPageCount };
  });

  await test.step(sections.steps.hideNestedFolder, async () => {
    await sourceCommand(() => filterPanel.expandFolder("t024"));
    await sourceCommand(() => filterPanel.hideFolder("t024/deeper"));
    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(initialPageCount - 1));
    await sourceCommand(() => filterPanel.collapseFolder("t024"));
    await sourceCommand(() => filterPanel.expectDescendantActivity("t024"));
    await sourceCommand(() => addKeyFrame(filters));
    await sourceCommand(() => addKeyFrame(folderFilter));
    await sourceCommand(() => checkpoint("collapsed folder shows nested hide activity"));
  });

  await test.step(sections.steps.resetFolderFilters, async () => {
    await sourceCommand(() => filterPanel.resetFolderFilters());
    await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(initialPageCount));
    await sourceCommand(() => filterPanel.expectNoDescendantActivity("t024"));
    await sourceCommand(() => filterPanel.expectFolderResetHidden());
    await sourceCommand(() => checkpoint("folder filters reset"));
  });

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
