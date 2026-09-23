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
import { BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { orphan, sourceSnapshot } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const EXPECTED_ORPHAN_COUNT = 13;
test.use({ isolateSourceGraphs: true });

const CHILD_OF_BLACKLISTED = "t007 ---- child of blacklisted page";

test.use({ bundleMode: "single-file" });

/*
 * Remove a link that leaves previously captured pages orphaned. Review the existing and
 * proposed orphans, then confirm that acceptance removes the chosen configuration.
 */
test("Sourcing reviews existing and candidate orphans with removal on acceptance", async ({
  page,
  sourceChanges,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  // --- Test start ---
  // Inspect the orphan summary.
  const editor = new BundleEditorPage(page, expect);
  await editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT);
  await addKeyFrame(sourceSnapshot);
  await snapshot("source toolbar counts existing orphans without a separate banner");

  // Open source review.
  const review = editor.sourceReview;
  const orphansModal = await review.reviewOrphans();
  await orphansModal.expectOrphanCount(EXPECTED_ORPHAN_COUNT);
  await orphansModal.expectOrphanListed(CHILD_OF_BLACKLISTED);
  await addKeyFrame(orphan);
  await snapshot("orphans review modal lists unreachable config pages");

  // Defer, then accept the orphan cleanup.
  await review.defer();
  await editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT);
  await review.reviewOrphans();
  await addKeyFrame(orphan);
  await review.applyOrphanRemovals();
  await editor.expectSourceOrphanCount(0);
  await snapshot("source review applies all configuration removals");

  // Remove the incoming link.
  await sourceChanges.apply('remove-incoming-link');
  await editor.checkSourceChanges();
  await expect(page.getByTestId('sourcing-status').getByRole('button')).toHaveText('2 source changes available – Review');
  await review.reviewOrphans();
  await orphansModal.showExplanation('t001 ---- child 2');
  await orphansModal.expectExplanation('t001 ---- child 2', 'no longer links to');
  await review.expectNoMissingEntry('t001/deeper/t001 ---- child 2.md');
  await addKeyFrame(orphan);
  await snapshot('candidate orphan is listed once and removed by default with its broken link');

  // Accept the source update.
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  await snapshot('acceptance removes the newly orphaned page');

  void bigBundle;

  await skipMeadowHomeStateCheck();
});
