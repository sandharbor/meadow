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
import { excalidraw } from "../src/scenario-docs/index.js";
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
test("excalidraw thumbnail in list view, embedded in preview, and standalone page", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  // Excalidraw's exportToSvg tries to use a Web Worker for font subsetting;
  // our vendor bundle doesn't define a Worker URL (we don't need worker-based
  // font subsetting for read-only rendering), so it logs an expected error
  // and falls back to the main thread. The fallback works fine and the
  // drawings render correctly — suppress this expected log noise.
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );

  const wf = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;

  await wf.navigateToBigBundle();
  await editor.switchToListView();
  await snapshot("list view loaded");

  // Find the excalidraw row. The big bundle also has a same-title `.svg` page
  // (`t006 --- meadow-flower.svg`); narrow on the file-type cell to pick the
  // excalidraw entry specifically.
  // The list-view thumbnail renders lazily on intersection — scroll it in.
  // First fetch + lz-string decompress + exportToSvg can take a couple of
  // seconds the first time the vendor bundle loads.
  await editor.expectListViewThumbnailVisible(
    "t006 --- meadow-flower",
    "excalidraw",
  );
  await snapshot("excalidraw thumbnail rendered inline in list view");

  // Hover the thumbnail to trigger the hover-preview popup. The popup is a
  // fixed-position div outside the row; we don't bind to it directly — the
  // keyframe screenshot captures it, and we just give it a moment to render.
  await editor.hoverListViewThumbnail("t006 --- meadow-flower", "excalidraw");
  await page.waitForTimeout(750);
  await addKeyFrame(excalidraw);
  await snapshot("excalidraw hover preview visible");

  // Move off the row so the popup doesn't follow us into the modal.
  await page.mouse.move(0, 0);

  // Open the bundle preview.
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await snapshot("preview modal opened");

  // Navigate inside the iframe to the page that embeds the drawing.
  await generatedBundle.clickPageLink("t006 - embedded media");
  await generatedBundle.expectHeading("t006 - embedded media");

  await generatedBundle.clickPageLink(
    "t006 --- page that embeds Excalidraw in another directory",
  );
  await generatedBundle.expectHeading(
    "t006 --- page that embeds Excalidraw in another directory",
  );

  const implicitEmbedHref =
    "embedded%20in%20page%20in%20other%20t006%20directory.html";
  await generatedBundle.excalidraw.expectEmbedVisible(implicitEmbedHref);

  await generatedBundle.excalidraw.clickEmbed(implicitEmbedHref);
  await generatedBundle.expectHeading(
    "embedded in page in other t006 directory",
  );
  await generatedBundle.excalidraw.expectStandaloneDrawingVisible();

  await generatedBundle.clickPageLink("t006 - embedded media");
  await generatedBundle.expectHeading("t006 - embedded media");

  // Scroll the embed into view (it's near the bottom of the page) so the
  // client renderer kicks in if it hadn't already.
  // Wait for the SVG to land inside the embed placeholder.
  await generatedBundle.excalidraw.expectEmbedVisible();
  await snapshot("excalidraw drawing rendered inline in preview page");
  await addKeyFrame(excalidraw);

  const directedDrawingHref =
    "t006/t006%20---%20linked-from-excalidraw.html";
  const directedNonTextHref =
    "t006/page%20linked%20from%20Excalidraw%20from%20a%20non-text%20element.html";
  const directedSunflowerHref =
    "t006/page%20linked%20from%20tracked%20sunflower%20image%20in%20Excalidraw.html";
  await generatedBundle.excalidraw.expectDirectedEmbedVisible();
  await generatedBundle.excalidraw.expectDirectedDrawingLink(directedDrawingHref);
  await generatedBundle.excalidraw.expectDirectedDrawingLink(directedNonTextHref);
  await generatedBundle.excalidraw.expectDirectedDrawingLink(directedSunflowerHref);
  await generatedBundle.excalidraw.expectDirectedStandaloneLinkAbsent();
  await snapshot("directed excalidraw embed rendered with live links");
  await addKeyFrame(excalidraw);

  await generatedBundle.excalidraw.openDirectedFullscreen();
  await page.waitForTimeout(750);
  await snapshot("directed excalidraw embed fullscreen open");
  await addKeyFrame(excalidraw);
  await generatedBundle.excalidraw.closeDirectedFullscreen();

  await generatedBundle.excalidraw.clickDirectedDrawingLink(directedDrawingHref);
  await generatedBundle.expectHeading("t006 --- linked-from-excalidraw");
  await snapshot("directed excalidraw embed link opened target");
  await addKeyFrame(excalidraw);

  await generatedBundle.clickPageLink("t006 - embedded media");
  await generatedBundle.expectHeading("t006 - embedded media");

  // Click the embed thumbnail — it's an `<a>` link to the standalone page.
  await generatedBundle.excalidraw.clickEmbed();
  await generatedBundle.expectHeading("t006 --- meadow-flower");

  // Wait for the standalone page's drawing to render.
  await generatedBundle.excalidraw.expectStandaloneDrawingVisible();
  await snapshot("standalone excalidraw page with full drawing");
  await addKeyFrame(excalidraw);

  const standaloneDrawingHref =
    "t006%20---%20linked-from-excalidraw.html";
  const nonTextElementHref =
    "page%20linked%20from%20Excalidraw%20from%20a%20non-text%20element.html";
  const sunflowerImageHref =
    "page%20linked%20from%20tracked%20sunflower%20image%20in%20Excalidraw.html";
  await generatedBundle.excalidraw.expectStandaloneDrawingLink(
    standaloneDrawingHref,
  );
  await generatedBundle.excalidraw.expectStandaloneDrawingLink(
    nonTextElementHref,
  );
  await generatedBundle.excalidraw.expectStandaloneDrawingLink(
    sunflowerImageHref,
  );
  await generatedBundle.excalidraw.clickStandaloneDrawingLink(sunflowerImageHref);
  await generatedBundle.expectHeading(
    "page linked from tracked sunflower image in Excalidraw",
  );
  await snapshot("standalone excalidraw tracked image link opened target");
  await addKeyFrame(excalidraw);

  await generatedBundle.clickPageLink("t006 --- meadow-flower");
  await generatedBundle.expectHeading("t006 --- meadow-flower");
  await generatedBundle.excalidraw.expectStandaloneDrawingVisible();

  const nonTextLinkedBundle =
    await generatedBundle.excalidraw.openStandaloneDrawingLinkInNewTab(
      nonTextElementHref,
    );
  await nonTextLinkedBundle.expectHeading(
    "page linked from Excalidraw from a non-text element",
  );
  await generatedBundle.expectHeading("t006 --- meadow-flower");
  await nonTextLinkedBundle.close();

  const linkedBundle =
    await generatedBundle.excalidraw.openStandaloneDrawingLinkInNewTab(
      standaloneDrawingHref,
    );
  await linkedBundle.expectHeading(
    "t006 --- linked-from-excalidraw",
  );
  await generatedBundle.expectHeading("t006 --- meadow-flower");
  await linkedBundle.close();

  await generatedBundle.excalidraw.clickStandaloneDrawingLink(
    standaloneDrawingHref,
  );
  await generatedBundle.expectHeading("t006 --- linked-from-excalidraw");

  releaseWorkerWarning();
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
