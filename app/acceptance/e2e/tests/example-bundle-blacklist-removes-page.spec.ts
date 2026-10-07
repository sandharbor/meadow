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
  BundleListPage,
  BundleEditorPage,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { sourcingReviewRedesign, blacklist, bundleConfig, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`blacklisting a single page removes it from the rendered preview`);

const description = linkedScenarioDescription(conceptText`Blacklist a page in the example bundle and regenerate it. The rendered bundle should
omit that page.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '1e577e1d-98d4-4d19-abf1-e48652aa4196' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  // Add the example bundle from the empty state
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  await sourceCommand(() => editor.waitForLoad("example-bundle"));

  // Sanity-check the initial preview: "Razors" is linked from the initial
  // page, and its link targets "Occam's Razor" and "Hanlon's Razor" (which
  // are also linked directly from the initial page) are present too. This
  // baseline matters for the post-blacklist assertions below.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewComplete());
  await sourceCommand(() => previewModal.expectPreviewIframeHeading("Notable Mental Models"));
  await sourceCommand(() => previewModal.expectPreviewLinkVisible("Razors.html"));
  await sourceCommand(() => previewModal.expectPreviewLinkVisible("Occam's%20Razor.html"));
  await sourceCommand(() => previewModal.expectPreviewLinkVisible("Hanlon's%20Razor.html"));
  await sourceCommand(() => checkpoint("example bundle preview — Razors link present"));

  // --- Test start ---
  // Blacklist the linked page.
  await sourceCommand(() => previewModal.closeModal());

  // Blacklist "Razors" via the right-click context menu. Blacklisting a
  // tracked page is a "simple op" that auto-saves and commits immediately,
  // so no explicit Save click is required. (The Blacklist action button in
  // the selected-page detail panel only appears for untracked pages; tracked
  // pages use the context-menu path.)
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.rightClickRow("Razors"));
  await sourceCommand(() => editor.clickContextMenuItemAndAwaitAutoSaveAndGraphReload("Blacklist"));

  // Auto-save means there is no pending draft — Save/Undo should not appear.
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Undo blacklist change', exact: true })).toBeVisible());
  await sourceCommand(() => addKeyFrame(blacklist));
  await sourceCommand(() => addKeyFrame(bundleConfig));
  await sourceCommand(() => checkpoint("Razors blacklisted — no save button"));

  // Preview the changed links.
  // Preview again: the link to Razors must be gone from the rendered initial
  // page. "Occam's Razor" and "Hanlon's Razor" remain — they are tracked and
  // still reachable directly from the initial page, so blacklisting "Razors"
  // does not transitively remove them. Blacklisting is per-page.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewComplete());
  await sourceCommand(() => previewModal.expectPreviewIframeHeading("Notable Mental Models"));
  await sourceCommand(() => previewModal.expectPreviewLinkNotVisible("Razors.html"));
  await sourceCommand(() => previewModal.expectPreviewLinkVisible("Occam's%20Razor.html"));
  await sourceCommand(() => previewModal.expectPreviewLinkVisible("Hanlon's%20Razor.html"));
  await sourceCommand(() => checkpoint("post-blacklist preview — Razors link removed"));

  void exampleBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
