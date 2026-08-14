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
import { BundleEditorPage, OrphansModal } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { orphan, callout } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const EXPECTED_ORPHAN_COUNT = 13;
const CHILD_OF_BLACKLISTED = "t007 ---- child of blacklisted page";

test.use({ bundleMode: "single-file" });

test("Callout banner warns about orphaned pages in bundle config", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  const editor = new BundleEditorPage(page, expect);
  await editor.expectOrphansBannerCount(EXPECTED_ORPHAN_COUNT);
  await addKeyFrame(callout);
  await snapshot("orphans callout banner visible");

  await editor.clickReviewOrphanedPages();
  const orphansModal = new OrphansModal(page, expect);
  await orphansModal.waitForOpen();
  await orphansModal.expectOrphanCount(EXPECTED_ORPHAN_COUNT);
  await orphansModal.expectOrphanListed(CHILD_OF_BLACKLISTED);
  await addKeyFrame(orphan);
  await snapshot("orphans review modal lists unreachable config pages");

  await orphansModal.clickRemoveAllFromConfig();
  await orphansModal.expectClosed();
  await editor.expectOrphansBannerNotVisible();
  await snapshot("orphans callout and modal gone after remove all");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
