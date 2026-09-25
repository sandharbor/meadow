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
import {
  BundleEditorPage,
  PreviewPublishModal,
  CustomizeTab,
} from "../src/run/pages/index.js";
import { excalidraw, hooks } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ trackBigBundleExcalidrawPages: true });

// A maximally-aggressive page-title hook: every page on the bundle gets a
// "myprefix " prepended to its title. The point is to exercise three places
// the prefix has to flow through for an Excalidraw drawing:
//   1. The embedding page's heading (`myprefix t006 - embedded media`).
//   2. The standalone Excalidraw HTML file (the embed link must resolve to
//      `myprefix t006 --- meadow-flower.html`, not `t006 --- meadow-flower.html`).
//   3. The label and href of every wikilink rendered inside the SVG.
const PREFIX_HOOK_SOURCE = `function pageTitleNormalization(bundleSlug: string, pageTitle: string): string {
  return 'myprefix ' + pageTitle;
}
`;

/*
 * Apply a page-title hook and preview an embedded drawing. Both the drawing's link labels
 * and its targets should reflect the renamed pages.
 */
test("Excalidraw embed and in-drawing links pick up page-title hook prefix", async ({
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  // --- Setup ---
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );
  // Excalidraw fetches Excalifont from a CDN at render time; under parallel
  // load that fetch occasionally fails. The fallback works fine — the drawing
  // still renders — but the error log entry would trip the run guardrail.
  const releaseFontWarning = expectLogErrors(
    /Failed to fetch font family/,
  );

  const wf = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;

  await wf.navigateToBigBundle();
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await checkpoint("preview completed before hook installed");

  // --- Test start ---
  // Open the page-title hook.
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.hooks.switchScopeToGlobal();
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await pageTitleHook.clickEdit();
  await checkpoint("global Page Title editor opened");

  // Change the title prefix.
  await pageTitleHook.setContent(PREFIX_HOOK_SOURCE);
  await checkpoint("hook content replaced with myprefix hook");

  // Save and regenerate the preview.
  const previewStreamDone = page.waitForResponse((resp) =>
    resp.url().includes("/preview-stream"),
  );
  await pageTitleHook.save();
  await previewStreamDone;
  await addKeyFrame(hooks);
  await checkpoint("hook saved - preview regenerated");

  // Inspect the renamed embedding page.
  // Close the floating hook editor so it stops intercepting clicks on the
  // preview iframe below it.
  await pageTitleHook.close();

  // The iframe re-renders with the new prefix — wait for the main page heading
  // to settle before navigating, otherwise we could click a stale link.
  await modal.expectPreviewIframeHeading("myprefix main page");

  await generatedBundle.clickPageLink("myprefix t006 - embedded media");
  await generatedBundle.expectHeading("myprefix t006 - embedded media");
  await checkpoint("embedding page rendered with myprefix heading");

  // Open the standalone drawing.
  // Click the embed thumbnail. The embed `<a>` href must use the normalized
  // drawing title — otherwise this navigates to a 404 page.
  await generatedBundle.excalidraw.expectEmbedVisible();
  await generatedBundle.excalidraw.clickEmbed();
  await generatedBundle.expectHeading("myprefix t006 --- meadow-flower");
  await addKeyFrame(excalidraw);
  await checkpoint("standalone excalidraw page rendered with myprefix heading");

  // Inspect the renamed drawing links.
  await generatedBundle.excalidraw.expectStandaloneDrawingVisible();

  // The first non-aliased wikilink in the drawing points at
  // `t006 --- linked-from-excalidraw`. After the hook, both the rendered text
  // and the href on the surrounding `<a>` should reflect the prefix.
  const renamedHref =
    "myprefix%20t006%20---%20linked-from-excalidraw.html";
  await generatedBundle.excalidraw.expectStandaloneDrawingLink(
    renamedHref,
    "myprefix t006 --- linked-from-excalidraw",
  );
  await addKeyFrame(excalidraw);
  await addKeyFrame(hooks);
  await checkpoint("in-drawing link reflects myprefix in both text and href");

  // Follow the renamed link.
  await generatedBundle.excalidraw.expectNoStandaloneDrawingLink(
    "t006%20---%20linked-from-excalidraw.html",
  );

  // Following the link should land on the renamed page.
  await generatedBundle.excalidraw.clickStandaloneDrawingLink(renamedHref);
  await generatedBundle.expectHeading(
    "myprefix t006 --- linked-from-excalidraw",
  );
  await checkpoint("navigated to renamed link target page");

  // Finish the expected-warning check.
  releaseWorkerWarning();
  releaseFontWarning();
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
