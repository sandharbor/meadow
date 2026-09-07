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
import { BundleEditorPage, SourceOrphansReview } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { orphan, sourceSnapshot } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const EXPECTED_ORPHAN_COUNT = 13;
test.use({ isolateSourceGraphs: true });

const CHILD_OF_BLACKLISTED = "t007 ---- child of blacklisted page";

test.use({ bundleMode: "single-file" });

test("Sourcing reviews existing and candidate orphans with reversible individual and bulk removal", async ({
  page,
  sourceChanges,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  const editor = new BundleEditorPage(page, expect);
  await editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT);
  await addKeyFrame(sourceSnapshot);
  await snapshot("source toolbar counts existing orphans without a separate banner");

  await editor.reviewSourceOrphans();
  const orphansModal = new SourceOrphansReview(page, expect);
  await orphansModal.waitForOpen();
  await orphansModal.expectOrphanCount(EXPECTED_ORPHAN_COUNT);
  await orphansModal.expectOrphanListed(CHILD_OF_BLACKLISTED);
  await addKeyFrame(orphan);
  await snapshot("orphans review modal lists unreachable config pages");

  const existingRow = page.getByTestId(`orphan-row-${CHILD_OF_BLACKLISTED}`);
  await existingRow.getByRole('button', { name: 'Remove from config', exact: true }).click();
  await expect(existingRow).toContainText('Will be removed');
  await existingRow.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await orphansModal.clickRemoveAllFromConfig();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT);
  await editor.reviewSourceOrphans();
  await expect(page.getByTestId('remove-all-orphans')).toHaveText('Undo all removals');
  await addKeyFrame(orphan);
  await orphansModal.applyRemovals();
  await orphansModal.expectClosed();
  await editor.expectSourceOrphanCount(0);
  await snapshot("source review applies all configuration removals");
  await sourceChanges.apply('remove-incoming-link');
  await editor.checkSourceChanges();
  await expect(page.getByTestId('sourcing-status').getByRole('button')).toHaveText('2 source changes available – Review');
  await editor.reviewSourceOrphans();
  const newOrphan = page.getByTestId('orphan-row-t001 ---- child 2');
  await newOrphan.getByText('Why is this orphaned?', { exact: true }).click();
  await expect(newOrphan).toContainText('no longer connects');
  await newOrphan.getByRole('button', { name: 'Remove from config', exact: true }).click();
  await addKeyFrame(orphan);
  await snapshot('candidate orphan can be removed in the same review as its broken link');
  await page.getByRole('button', { name: 'Accept source update', exact: true }).click();
  await editor.expectSourceOrphanCount(0);
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
