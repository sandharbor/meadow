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
import { ChangesTab, CustomizeTab, PreviewPublishModal } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { changesTab as changesTabDoc, customize, versioning } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

/*
 * Change a saved generation and create a connected successor. The predecessor should
 * freeze, comparison should remain available, and sharing should warn when an older
 * version is selected.
 */
test("V06 generated version connected successor freezes its predecessor and supports comparison", { annotation: { type: 'scenario-id', description: '74ff8663-eed7-4380-b7d6-bfd3ded60fda' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToBigBundlePreview());

  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Big);
  const initialVersion = await sourceCommand(() => versions.waitForOnlyVersion());

  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.clickStep1Review());

  await sourceCommand(() => checkpoint("the initial generated version is saved"));

  // --- Test start ---
  // Change the generation options.
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  await sourceCommand(() => customizeTab.generationOptions.disableBreadcrumbs());
  await sourceCommand(() => checkpoint("breadcrumbs disabled for successor"));

  // Review the changed output.
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => changesTab.expectBadgeVisible());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.expectOnlyModifiedFiles());
  await sourceCommand(() => changesTab.clickFirstHtmlFile());
  await sourceCommand(() => changesTab.fileDetails.ensureOnDiffTab());
  await sourceCommand(() => changesTab.fileDetails.clickCodeSubTab());
  await sourceCommand(() => changesTab.fileDetails.expectChangesHeader());
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint("pending successor contains modified files"));

  // Create a connected version.
  await sourceCommand(() => modal.openCreateNewVersionDialog());
  await sourceCommand(() => modal.createConnectedVersion("Breadcrumb-free reader version"));
  await sourceCommand(() => modal.expectVersionsTabActive());
  await sourceCommand(() => modal.expectVersionCreatedMessageHidden());

  const [predecessor, successor] = await sourceCommand(() => versions.waitForCount(2));
  expect(predecessor).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "frozen",
  });
  expect(successor).toMatchObject({
    displayState: "unsaved",
    notes: "Breadcrumb-free reader version",
  });

  await sourceCommand(() => modal.clickVersionsTab());
  await sourceCommand(() => expect(page.getByText("Frozen", { exact: true })).toBeVisible());
  await sourceCommand(() => expect(page.getByText("Unsaved", { exact: true })).toBeVisible());
  await sourceCommand(() => expect(page.getByText("Breadcrumb-free reader version", { exact: true })).toBeVisible());
  await sourceCommand(() => modal.expectCreateNewVersionDisabledForUnsavedVersion());
  await sourceCommand(() => modal.expectVersionCardsNewestFirst(successor.versionId, predecessor.versionId));
  await sourceCommand(() => expect(page.getByRole("heading", { name: "Compare generated files" })).toBeVisible());
  await sourceCommand(() => expect(page.getByText("modified", { exact: true }).first()).toBeVisible());
  await sourceCommand(() => addKeyFrame(versioning));
  await sourceCommand(() => checkpoint("connected successor created and compared"));

  // Compare sharing the old and new versions.
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.expectOnlyNewFiles());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.expectShareVersionPurpose("publish"));
  await sourceCommand(() => modal.expectShareVersionSelected(successor.versionId, "v2"));
  await sourceCommand(() => modal.expectShareVersionOptionsNewestFirst(successor.versionId, predecessor.versionId));
  await sourceCommand(() => modal.selectShareVersion(predecessor.versionId));
  await sourceCommand(() => modal.expectOlderShareVersionWarning("v1", "v2"));
  await sourceCommand(() => addKeyFrame(versioning));
  await sourceCommand(() => checkpoint("publish identifies the selected generated version and warns before using an older one"));

  // Return to the new version.
  await sourceCommand(() => modal.selectShareVersion(successor.versionId));

  void bigBundle;
  await sourceCommand(() => checkpoint("the connected successor is selected for sharing"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
