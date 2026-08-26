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
import {
  changesTab as changesTabDoc,
  htmlGeneration,
  tracking,
} from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("untracking a saved page deletes it from the next preview and retracking adds it back", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const pageTitle = "t001 - deeply nested";
  const generatedFilename = `${pageTitle}.html`;

  // Establish a saved generation baseline, matching a publisher who previews
  // the already-curated bundle, saves its generated files, and closes Review.
  await workflows.navigateToBigBundlePreview();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.closeModal();

  // Untracking is a simple operation: it auto-saves the configuration without
  // presenting the editor's Save/Undo controls.
  await editor.switchToListView();
  await editor.rightClickRow(pageTitle);
  await editor.clickContextMenuItemAndAwaitAutoSave("Untrack");
  await editor.expectUndoNotVisible();
  await snapshot("tracked page untracked and auto-saved");

  // The next preview must remove the page's generated HTML and modify other
  // generated files that previously linked to it.
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await modal.clickChangesTab();
  await changesTab.openHtmlSectionChangesFilter();
  expect(await changesTab.getChangeTypeCount("Deleted")).toBeGreaterThan(0);
  expect(await changesTab.getChangeTypeCount("Modified")).toBeGreaterThan(0);
  await changesTab.expectFileInChanges(generatedFilename);
  await addKeyFrame(tracking);
  await addKeyFrame(changesTabDoc);
  await addKeyFrame(htmlGeneration);
  await snapshot("preview deletes the untracked page");

  await modal.clickBundlePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.closeModal();

  // Track the same page again and prove the reverse transition is generated.
  await editor.clickListViewRowByName(pageTitle);
  const selectedPage = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await selectedPage.clickAction(ActionButton.Track, page);
  await editor.expectUndoNotVisible();

  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await modal.clickChangesTab();
  await changesTab.openHtmlSectionChangesFilter();
  expect(await changesTab.getChangeTypeCount("Added")).toBeGreaterThan(0);
  expect(await changesTab.getChangeTypeCount("Modified")).toBeGreaterThan(0);
  await changesTab.expectFileInChanges(generatedFilename);
  await snapshot("preview adds the retracked page back");

  await modal.clickBundlePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  void bigBundle;

  await assertMeadowHomeState();
});
