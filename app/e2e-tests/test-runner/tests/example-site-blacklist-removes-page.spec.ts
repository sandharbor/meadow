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
  SiteListPage,
  SiteEditorPage,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import {
  blacklist,
  siteConfig,
} from "../src/scenario-docs/index.js";
import { exampleSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("blacklisting a single page removes it from the rendered preview", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  // Add the example site from the empty state
  await siteList.goto();
  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");

  // Sanity-check the initial preview: "Razors" is linked from the initial
  // page, and its link targets "Occam's Razor" and "Hanlon's Razor" (which
  // are also linked directly from the initial page) are present too. This
  // baseline matters for the post-blacklist assertions below.
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.expectPreviewIframeHeading("Notable Mental Models");
  await previewModal.expectPreviewLinkVisible("Razors.html");
  await previewModal.expectPreviewLinkVisible("Occam's%20Razor.html");
  await previewModal.expectPreviewLinkVisible("Hanlon's%20Razor.html");
  await snapshot("example site preview — Razors link present");
  await previewModal.closeModal();

  // Blacklist "Razors" via the right-click context menu. Blacklisting a
  // tracked page is a "simple op" that auto-saves and commits immediately,
  // so no explicit Save click is required. (The Blacklist action button in
  // the selected-page detail panel only appears for untracked pages; tracked
  // pages use the context-menu path.)
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("Razors");
  await editor.clickContextMenuItemAndAwaitAutoSave("Blacklist");

  // Auto-save means there is no pending draft — Save/Undo should not appear.
  await editor.expectUndoNotVisible();
  await addKeyFrame(blacklist);
  await addKeyFrame(siteConfig);
  await snapshot("Razors blacklisted — no save button");

  // Preview again: the link to Razors must be gone from the rendered initial
  // page. "Occam's Razor" and "Hanlon's Razor" remain — they are tracked and
  // still reachable directly from the initial page, so blacklisting "Razors"
  // does not transitively remove them. Blacklisting is per-page.
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.expectPreviewIframeHeading("Notable Mental Models");
  await previewModal.expectPreviewLinkNotVisible("Razors.html");
  await previewModal.expectPreviewLinkVisible("Occam's%20Razor.html");
  await previewModal.expectPreviewLinkVisible("Hanlon's%20Razor.html");
  await snapshot("post-blacklist preview — Razors link removed");
  void exampleSite;
});
