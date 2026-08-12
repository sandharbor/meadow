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

test.use({ siteMode: "single-file" });

test.use({ trackBigSiteExcalidrawPages: true });

/**
 * Verifies that a wikilink inside an Excalidraw drawing whose target page is
 * not whitelisted on the site renders as a non-clickable "link not tracked"
 * label, matching the affordance regular pages already use.
 */
test("Excalidraw link to untracked page renders as 'link not tracked'", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
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
  const editor = new SiteEditorPage(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const generatedSite = modal.generatedSite;

  await wf.navigateToBigSite();
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await snapshot("preview completed");

  await generatedSite.clickPageLink("t006 - embedded media");
  await generatedSite.expectHeading("t006 - embedded media");

  await generatedSite.excalidraw.expectEmbedVisible();
  await generatedSite.excalidraw.clickEmbed();
  await generatedSite.expectHeading("t006 --- meadow-flower");

  await generatedSite.excalidraw.expectStandaloneDrawingVisible();

  // The untracked target should never be wrapped in an anchor — the original
  // page-title text is replaced with "link not tracked" before rendering.
  const untrackedHref =
    "page%20linked%20from%20Excalidraw%20that%20is%20not%20tracked.html";
  await generatedSite.excalidraw.expectNoStandaloneDrawingLink(untrackedHref);
  await generatedSite.excalidraw.expectNoStandaloneDrawingLinkContaining(
    "not%20tracked",
  );

  // The replacement text shows up in the rendered SVG.
  await generatedSite.excalidraw.expectStandaloneDrawingText("link not tracked");
  await snapshot("excalidraw untracked link rendered as 'link not tracked'");
  await addKeyFrame(excalidraw);

  releaseWorkerWarning();
  releaseFontWarning();
  void bigSite;

  await skipMeadowHomeStateCheck();
});
