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
  ActionButton,
  BundleEditorPage,
  ChangesTab,
  PreviewPublishModal,
  SelectedPageDetailComponent,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { changesTab as changesTabDoc, htmlGeneration, tracking, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`untracking a saved page deletes it from the next preview and retracking adds it back`);

const description = linkedScenarioDescription(conceptText`Untrack a page from a saved bundle and regenerate, then track it again. Review should
first show its removal and then its return before each save.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '09f3977f-b9a3-4467-af26-51cc5f4423f3' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const pageTitle = "t001 - deeply nested";
  const generatedFilename = `${pageTitle}.html`;

  // Establish a saved generation baseline, matching a publisher who previews
  // the already-curated bundle, saves its generated files, and closes Review.
  await sourceCommand(() => workflows.navigateToBigBundlePreview());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.closeModal());

  await sourceCommand(() => checkpoint("the tracked page is included in a saved generation"));

  // --- Test start ---
  // Untrack the page.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.rightClickRow(pageTitle));
  await sourceCommand(() => editor.clickContextMenuItemAndAwaitAutoSave("Untrack"));
  await sourceCommand(() => editor.expectUndoNotVisible());
  await sourceCommand(() => checkpoint("tracked page untracked and auto-saved"));

  // Preview the removed page.
  // The next preview must remove the page's generated HTML and modify other
  // generated files that previously linked to it.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  expect(await sourceCommand(() => changesTab.getChangeTypeCount("Deleted"))).toBeGreaterThan(0);
  expect(await sourceCommand(() => changesTab.getChangeTypeCount("Modified"))).toBeGreaterThan(0);
  await sourceCommand(() => changesTab.expectFileInChanges(generatedFilename));
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("preview deletes the untracked page"));

  // Save and track the page again.
  await sourceCommand(() => modal.clickBundlePreviewTab());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.closeModal());

  // Track the same page again and prove the reverse transition is generated.
  await sourceCommand(() => editor.clickListViewRowByName(pageTitle));
  const selectedPage = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await sourceCommand(() => selectedPage.clickAction(ActionButton.Track, page));
  await sourceCommand(() => editor.expectUndoNotVisible());

  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.openHtmlSectionChangesFilter());
  expect(await sourceCommand(() => changesTab.getChangeTypeCount("Added"))).toBeGreaterThan(0);
  expect(await sourceCommand(() => changesTab.getChangeTypeCount("Modified"))).toBeGreaterThan(0);
  await sourceCommand(() => changesTab.expectFileInChanges(generatedFilename));
  await sourceCommand(() => checkpoint("preview adds the retracked page back"));

  // Save the restored page.
  await sourceCommand(() => modal.clickBundlePreviewTab());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  void bigBundle;

  await sourceCommand(() => checkpoint("the restored page is saved in the generated version"));

  await sourceCommand(() => assertMeadowHomeState());
});
