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
  SiteEditorPage,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { tracking, callout } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Preview reopens on Review step after tracking pages via Check Them link", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);

  // ── Navigate to big site preview → save → share tab ──

  await wf.navigateToBigSiteShareTab();
  await snapshot("share tab with untracked warning");

  // ── Click "Check them" to close modal and filter to untracked pages ──

  await modal.clickCheckUntrackedPages();
  await page.waitForTimeout(500);
  await addKeyFrame(callout);
  await snapshot("modal closed - untracked filter active");

  // ── Track untracked pages (Select All → deselect sensitive → Track All) ──
  // This leaves sensitive pages untracked so the "untracked page" warning
  // still appears when we reopen the preview modal.

  await editor.clickSelectAll();
  await page.waitForTimeout(500);

  await editor.clickDeselectSensitivePagesIfVisible();
  await page.waitForTimeout(250);

  await editor.clickTrackAll();
  await addKeyFrame(tracking);
  await snapshot("non-sensitive untracked pages tracked");

  // ── Reopen preview and verify it lands on step 1 (Review), not step 2 (Share) ──

  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await modal.expectOnReviewStep();
  await snapshot("preview reopens on review step not share step");
  void bigSite;

  await assertMeadowHomeState();
});
