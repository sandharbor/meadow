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
import { SiteEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { excalidraw } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

/**
 * Walks Excalidraw drawing support end-to-end through the UI:
 *   1. Editor list view shows the inline thumbnail rendered via the same
 *      vendored Excalidraw renderer the published site uses, and the hover
 *      preview popup shows it bigger.
 *   2. Site preview opens; navigating to the embedding page reveals the
 *      drawing as a clickable thumbnail inline in the page.
 *   3. Clicking the embed takes the reader to the standalone Excalidraw HTML
 *      page where the drawing renders at full size.
 */
test("excalidraw thumbnail in list view, embedded in preview, and standalone page", async ({
  page,
  snapshot,
  assertMeadowHomeState,
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
  const editor = new SiteEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);

  await wf.navigateToBigSite();
  await editor.switchToListView();
  await snapshot("list view loaded");

  // Find the excalidraw row. The big site also has a same-title `.svg` page
  // (`t006 --- meadow-flower.svg`); narrow on the file-type cell to pick the
  // excalidraw entry specifically.
  const excalidrawRow = page
    .locator("table tbody tr")
    .filter({ hasText: "t006 --- meadow-flower" })
    .filter({ has: page.locator('td:text-is(".excalidraw")') })
    .first();

  // The list-view thumbnail renders lazily on intersection — scroll it in.
  await excalidrawRow.scrollIntoViewIfNeeded();

  // Wait for the rendered SVG to land inside the row's thumbnail container.
  // First fetch + lz-string decompress + exportToSvg can take a couple of
  // seconds the first time the vendor bundle loads.
  const inlineThumbSvg = excalidrawRow.locator('[role="img"] svg').first();
  await expect(inlineThumbSvg).toBeVisible({ timeout: 30_000 });
  await snapshot("excalidraw thumbnail rendered inline in list view");

  // Hover the thumbnail to trigger the hover-preview popup. The popup is a
  // fixed-position div outside the row; we don't bind to it directly — the
  // keyframe screenshot captures it, and we just give it a moment to render.
  await inlineThumbSvg.hover();
  await page.waitForTimeout(750);
  await addKeyFrame(excalidraw);
  await snapshot("excalidraw hover preview visible");

  // Move off the row so the popup doesn't follow us into the modal.
  await page.mouse.move(0, 0);

  // Open the site preview.
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await snapshot("preview modal opened");

  // Navigate inside the iframe to the page that embeds the drawing.
  const previewFrame = page.frameLocator('iframe[title="Preview"]');
  await previewFrame
    .getByRole("link", { name: "t006 - embedded media" })
    .first()
    .click();
  await expect(previewFrame.locator("h1").first()).toContainText(
    "t006 - embedded media",
    { timeout: 15_000 },
  );

  // Scroll the embed into view (it's near the bottom of the page) so the
  // client renderer kicks in if it hadn't already.
  const embedLink = previewFrame.locator("a.meadow-excalidraw-embed-link").first();
  await embedLink.scrollIntoViewIfNeeded();

  // Wait for the SVG to land inside the embed placeholder.
  await expect(embedLink.locator("svg").first()).toBeVisible({ timeout: 30_000 });
  await snapshot("excalidraw drawing rendered inline in preview page");
  await addKeyFrame(excalidraw);

  // Click the embed thumbnail — it's an `<a>` link to the standalone page.
  await embedLink.click();
  await expect(previewFrame.locator("h1").first()).toContainText(
    "t006 --- meadow-flower",
    { timeout: 15_000 },
  );

  // Wait for the standalone page's drawing to render.
  const standaloneSvg = previewFrame
    .locator(".meadow-excalidraw-page svg")
    .first();
  await expect(standaloneSvg).toBeVisible({ timeout: 30_000 });
  await snapshot("standalone excalidraw page with full drawing");
  await addKeyFrame(excalidraw);

  releaseWorkerWarning();
  void bigSite;

  await assertMeadowHomeState();
});
