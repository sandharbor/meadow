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

import fs from "fs";
import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { ChangesTab, PreviewPublishModal } from "../src/run/pages/index.js";
import { GeneratedBundleVersions } from "../src/run/utils/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { versioning } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

test("V07 L01 generated version no-change creation requires confirmation and correlated logs", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundlePreview();

  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  const versions = new GeneratedBundleVersions(page, expect, Bundle.Big);
  const initialVersion = await versions.waitForOnlyVersion();

  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickStep1Review();
  await modal.clickChangesTab();
  await changesTab.expectNoChangedFiles();

  await modal.openCreateNewVersionDialog();
  await modal.expectReaderConnectionCopy();
  await modal.expectNoChangeVersionConfirmationRequired();
  await addKeyFrame(versioning);
  await snapshot("no-change version requires explicit confirmation");
  await modal.confirmNoChangeVersionCreation();
  await modal.submitConfirmedNoChangeVersion("No-change checkpoint");
  await modal.expectVersionsTabActive();
  await modal.expectVersionCreatedMessageHidden();

  const [predecessor, successor] = await versions.waitForCount(2);
  expect(predecessor).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "frozen",
  });
  expect(successor).toMatchObject({
    displayState: "unsaved",
    notes: "No-change checkpoint",
  });

  await expect(page.getByText("No-change checkpoint", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  await snapshot("confirmed no-change version created");

  const logPath = path.join(testServer.configDir, "logs", "meadow.log");
  await expect.poll(() => fs.readFileSync(logPath, "utf8"))
    .toMatch(/\[operation ([0-9a-f-]+)] \[version-create] Started[\s\S]*\[operation \1] \[version-create] Created version/);

  void bigBundle;
  await skipMeadowHomeStateCheck();
});
