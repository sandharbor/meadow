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
import { versioning } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });
test.use({ serialGroup: "generated-bundle-versioning" });

/*
 * Request another version when generated files have not changed. Creation should require
 * explicit confirmation and produce a complete, correlated operation log.
 */
test("V07 L01 generated version no-change creation requires confirmation and correlated logs", { annotation: { type: 'scenario-id', description: 'ec53dab3-2953-40e2-b863-b06d10357ea1' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
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
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.expectNoChangedFiles());

  await sourceCommand(() => checkpoint("the saved version has no generated changes"));

  // --- Test start ---
  // Request another version.
  await sourceCommand(() => modal.openCreateNewVersionDialog());
  await sourceCommand(() => modal.expectReaderConnectionCopy());
  await sourceCommand(() => modal.expectNoChangeVersionConfirmationRequired());
  await sourceCommand(() => addKeyFrame(versioning));
  await sourceCommand(() => checkpoint("no-change version requires explicit confirmation"));

  // Confirm the intentional duplicate.
  await sourceCommand(() => modal.confirmNoChangeVersionCreation());
  await sourceCommand(() => modal.submitConfirmedNoChangeVersion("No-change checkpoint"));
  await sourceCommand(() => modal.expectVersionsTabActive());
  await sourceCommand(() => modal.expectVersionCreatedMessageHidden());

  const [predecessor, successor] = await sourceCommand(() => versions.waitForCount(2));
  expect(predecessor).toMatchObject({
    versionId: initialVersion.versionId,
    displayState: "frozen",
  });
  expect(successor).toMatchObject({
    displayState: "unsaved",
    notes: "No-change checkpoint",
  });

  await sourceCommand(() => expect(page.getByText("No-change checkpoint", { exact: true })).toBeVisible());
  await sourceCommand(() => expect(page.getByText("Unsaved", { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint("confirmed no-change version created"));

  // Check the recorded version operation.
  const logPath = path.join(testServer.configDir, "logs", "meadow.log");
  await sourceCommand(() => expect.poll(() => fs.readFileSync(logPath, "utf8"))
    .toMatch(/\[operation ([0-9a-f-]+)] \[version-create] Started[\s\S]*\[operation \1] \[version-create] Created version/));

  void bigBundle;
  await sourceCommand(() => checkpoint("the confirmed duplicate version has a complete operation log"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
