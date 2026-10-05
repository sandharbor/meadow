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
import { Workflows } from "../src/run/workflows.js";
import { BundleEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { excalidraw } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ trackBigBundleExcalidrawPages: true });

/**
 * Walks Excalidraw drawing support end-to-end through the UI:
 *   1. Editor list view shows the inline thumbnail rendered via the same
 *      vendored Excalidraw renderer the published bundle uses, and the hover
 *      preview popup shows it bigger.
 *   2. Bundle preview opens; navigating to the embedding page reveals the
 *      drawing as a clickable thumbnail inline in the page.
 *   3. Clicking the embed takes the reader to the standalone Excalidraw HTML
 *      page where the drawing renders at full size.
 */
/*
 * Inspect an Excalidraw thumbnail in the list, then view the drawing embedded and on its
 * own. All three representations should render correctly.
 */
test("excalidraw thumbnail in list view, embedded in preview, and standalone page", { annotation: { type: 'scenario-id', description: '5cc5229f-f7a7-4fba-96e2-3d1b28ea265f' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  // --- Setup ---
  // Excalidraw's exportToSvg tries to use a Web Worker for font subsetting;
  // our vendor bundle doesn't define a Worker URL (we don't need worker-based
  // font subsetting for read-only rendering), so it logs an expected error
  // and falls back to the main thread. The fallback works fine and the
  // drawings render correctly — suppress this expected log noise.
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );
  // Excalidraw fetches Excalifont from its CDN at render time. The renderer
  // falls back cleanly when that optional font request is unavailable; the
  // SVG visibility and link assertions below prove the drawing still works.
  const releaseFontWarning = expectLogErrors(
    /Failed to fetch font family/,
  );

  const wf = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;

  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => checkpoint("list view loaded"));

  // --- Test start ---
  // Inspect the drawing thumbnail.
  // Find the excalidraw row. The big bundle also has a same-title `.svg` page
  // (`t006 --- meadow-flower.svg`); narrow on the file-type cell to pick the
  // excalidraw entry specifically.
  // The list-view thumbnail renders lazily on intersection — scroll it in.
  // First fetch + lz-string decompress + exportToSvg can take a couple of
  // seconds the first time the vendor bundle loads.
  await sourceCommand(() => editor.expectListViewThumbnailVisible(
    "t006 --- meadow-flower",
    "excalidraw",
  ));
  await sourceCommand(() => checkpoint("excalidraw thumbnail rendered inline in list view"));

  // Open the hover preview.
  // Hover the thumbnail to trigger the hover-preview popup. The popup is a
  // fixed-position div outside the row; we don't bind to it directly — the
  // keyframe screenshot captures it, and we just give it a moment to render.
  await sourceCommand(() => editor.hoverListViewThumbnail("t006 --- meadow-flower", "excalidraw"));
  await sourceCommand(() => page.waitForTimeout(750));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("excalidraw hover preview visible"));

  // Preview the bundle.
  await sourceCommand(() => page.mouse.move(0, 0));

  // Open the bundle preview.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => checkpoint("preview modal opened"));

  // Open the page containing the drawing.
  await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

  await sourceCommand(() => generatedBundle.clickPageLink(
    "t006 --- page that embeds Excalidraw in another directory",
  ));
  await sourceCommand(() => generatedBundle.expectHeading(
    "t006 --- page that embeds Excalidraw in another directory",
  ));

  const implicitEmbedHref =
    "embedded%20in%20page%20in%20other%20t006%20directory.html";
  await sourceCommand(() => generatedBundle.excalidraw.expectEmbedVisible(implicitEmbedHref));

  await sourceCommand(() => generatedBundle.excalidraw.clickEmbed(implicitEmbedHref));
  await sourceCommand(() => generatedBundle.expectHeading(
    "embedded in page in other t006 directory",
  ));
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());

  await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

  // Scroll the embed into view (it's near the bottom of the page) so the
  // client renderer kicks in if it hadn't already.
  // Wait for the SVG to land inside the embed placeholder.
  await sourceCommand(() => generatedBundle.excalidraw.expectEmbedVisible());
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("excalidraw drawing rendered inline in preview page"));

  // Inspect the directed drawing links.
  const directedDrawingHref =
    "t006/t006%20---%20linked-from-excalidraw.html";
  const directedNonTextHref =
    "t006/page%20linked%20from%20Excalidraw%20from%20a%20non-text%20element.html";
  const directedSunflowerHref =
    "t006/page%20linked%20from%20tracked%20sunflower%20image%20in%20Excalidraw.html";
  await sourceCommand(() => generatedBundle.excalidraw.expectDirectedEmbedVisible());
  await sourceCommand(() => generatedBundle.excalidraw.expectDirectedDrawingLink(directedDrawingHref));
  await sourceCommand(() => generatedBundle.excalidraw.expectDirectedDrawingLink(directedNonTextHref));
  await sourceCommand(() => generatedBundle.excalidraw.expectDirectedDrawingLink(directedSunflowerHref));
  await sourceCommand(() => generatedBundle.excalidraw.expectDirectedStandaloneLinkAbsent());
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("directed excalidraw embed rendered with live links"));

  // Open the drawing fullscreen.
  await sourceCommand(() => generatedBundle.excalidraw.openDirectedFullscreen());
  await sourceCommand(() => page.waitForTimeout(750));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("directed excalidraw embed fullscreen open"));

  // Follow a directed drawing link.
  await sourceCommand(() => generatedBundle.excalidraw.closeDirectedFullscreen());

  await sourceCommand(() => generatedBundle.excalidraw.clickDirectedDrawingLink(directedDrawingHref));
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- linked-from-excalidraw"));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("directed excalidraw embed link opened target"));

  // Open the standalone drawing.
  await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

  // Click the embed thumbnail — it's an `<a>` link to the standalone page.
  await sourceCommand(() => generatedBundle.excalidraw.clickEmbed());
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower"));

  // Wait for the standalone page's drawing to render.
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("standalone excalidraw page with full drawing"));

  // Follow the tracked image link.
  const standaloneDrawingHref =
    "t006%20---%20linked-from-excalidraw.html";
  const nonTextElementHref =
    "page%20linked%20from%20Excalidraw%20from%20a%20non-text%20element.html";
  const sunflowerImageHref =
    "page%20linked%20from%20tracked%20sunflower%20image%20in%20Excalidraw.html";
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingLink(
    standaloneDrawingHref,
  ));
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingLink(
    nonTextElementHref,
  ));
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingLink(
    sunflowerImageHref,
  ));
  await sourceCommand(() => generatedBundle.excalidraw.clickStandaloneDrawingLink(sunflowerImageHref));
  await sourceCommand(() => generatedBundle.expectHeading(
    "page linked from tracked sunflower image in Excalidraw",
  ));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("standalone excalidraw tracked image link opened target"));

  // Check drawing links in new tabs.
  await sourceCommand(() => generatedBundle.clickPageLink("t006 --- meadow-flower"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower"));
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());

  const nonTextLinkedBundle =
    await sourceCommand(() => generatedBundle.excalidraw.openStandaloneDrawingLinkInNewTab(
      nonTextElementHref,
    ));
  await sourceCommand(() => nonTextLinkedBundle.expectHeading(
    "page linked from Excalidraw from a non-text element",
  ));
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower"));
  await sourceCommand(() => nonTextLinkedBundle.close());

  const linkedBundle =
    await sourceCommand(() => generatedBundle.excalidraw.openStandaloneDrawingLinkInNewTab(
      standaloneDrawingHref,
    ));
  await sourceCommand(() => linkedBundle.expectHeading(
    "t006 --- linked-from-excalidraw",
  ));
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower"));
  await sourceCommand(() => linkedBundle.close());

  await sourceCommand(() => generatedBundle.excalidraw.clickStandaloneDrawingLink(
    standaloneDrawingHref,
  ));
  await sourceCommand(() => generatedBundle.expectHeading("t006 --- linked-from-excalidraw"));

  releaseWorkerWarning();
  releaseFontWarning();
  void bigBundle;

  await sourceCommand(() => checkpoint("drawing links open the expected pages in both the same tab and new tabs"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
