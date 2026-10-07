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
import { sourcingReviewRedesign, orphan, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const EXPECTED_ORPHAN_COUNT = 13;

const CHILD_OF_BLACKLISTED = "t007 ---- child of blacklisted page";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing reviews existing and candidate orphans with removal on acceptance`);

const description = linkedScenarioDescription(conceptText`Remove a link that leaves previously captured pages orphaned. Review the existing and
proposed orphans, then confirm that acceptance removes the chosen configuration.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'fc541bcb-6df3-4c55-90f6-6c5dd6cf7871' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  sourceChanges,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // --- Test start ---
  // Inspect the orphan summary.
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint("source toolbar counts existing orphans without a separate banner"));

  // Open source review.
  const review = editor.sourceReview;
  const orphansModal = await sourceCommand(() => review.reviewOrphans());
  await sourceCommand(() => orphansModal.expectOrphanCount(EXPECTED_ORPHAN_COUNT));
  await sourceCommand(() => orphansModal.expectOrphanListed(CHILD_OF_BLACKLISTED));
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => checkpoint("orphans review modal lists unreachable config pages"));

  // Defer, then accept the orphan cleanup.
  await sourceCommand(() => review.defer());
  await sourceCommand(() => editor.expectSourceOrphanCount(EXPECTED_ORPHAN_COUNT));
  await sourceCommand(() => review.reviewOrphans());
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => review.applyOrphanRemovals());
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => checkpoint("source review applies all configuration removals"));

  // Remove the incoming link.
  await sourceCommand(() => sourceChanges.apply('remove-incoming-link'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => expect(page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i })).toHaveText('2 source changes available – Review'));
  await sourceCommand(() => review.reviewOrphans());
  await sourceCommand(() => orphansModal.showExplanation('t001 ---- child 2'));
  await sourceCommand(() => orphansModal.expectExplanation('t001 ---- child 2', 'no longer links to'));
  await sourceCommand(() => review.expectNoLongerIncluded('t001/deeper/t001 ---- child 2.md'));
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => checkpoint('candidate orphan is listed once and removed by default with its broken link'));

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => checkpoint('acceptance removes the newly orphaned page'));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
