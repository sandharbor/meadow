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
  SiteEditorPage,
  PreviewPublishModal,
  CustomizeTab,
} from "../src/run/pages/index.js";
import { excalidraw, hooks } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

// A maximally-aggressive page-title hook: every page on the site gets a
// "myprefix " prepended to its title. The point is to exercise three places
// the prefix has to flow through for an Excalidraw drawing:
//   1. The embedding page's heading (`myprefix t006 - embedded media`).
//   2. The standalone Excalidraw HTML file (the embed link must resolve to
//      `myprefix t006 --- meadow-flower.html`, not `t006 --- meadow-flower.html`).
//   3. The label and href of every wikilink rendered inside the SVG.
const PREFIX_HOOK_SOURCE = `function pageTitleNormalization(siteSlug: string, pageTitle: string): string {
  return 'myprefix ' + pageTitle;
}
`;

test("Excalidraw embed and in-drawing links pick up page-title hook prefix", async ({
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

  await wf.navigateToBigSite();
  await editor.clickPreview();
  await modal.waitForPreviewComplete();
  await snapshot("preview completed before hook installed");

  // Install the global Page Title hook.
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.hooks.switchScopeToGlobal();
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await pageTitleHook.clickEdit();
  await snapshot("global Page Title editor opened");

  await pageTitleHook.setContent(PREFIX_HOOK_SOURCE);
  await snapshot("hook content replaced with myprefix hook");

  const previewStreamDone = page.waitForResponse((resp) =>
    resp.url().includes("/preview-stream"),
  );
  await pageTitleHook.save();
  await previewStreamDone;
  await snapshot("hook saved - preview regenerated");
  await addKeyFrame(hooks);

  // Close the floating hook editor so it stops intercepting clicks on the
  // preview iframe below it.
  await pageTitleHook.close();

  // The iframe re-renders with the new prefix — wait for the main page heading
  // to settle before navigating, otherwise we could click a stale link.
  await modal.expectPreviewIframeHeading("myprefix main page");

  const previewFrame = page.frameLocator('iframe[title="Preview"]');
  await previewFrame
    .getByRole("link", { name: "myprefix t006 - embedded media" })
    .first()
    .click();
  await expect(previewFrame.locator("h1").first()).toContainText(
    "myprefix t006 - embedded media",
    { timeout: 15_000 },
  );
  await snapshot("embedding page rendered with myprefix heading");

  // Click the embed thumbnail. The embed `<a>` href must use the normalized
  // drawing title — otherwise this navigates to a 404 page.
  const embedLink = previewFrame
    .locator("a.meadow-excalidraw-embed-link")
    .first();
  await embedLink.scrollIntoViewIfNeeded();
  await expect(embedLink.locator("svg").first()).toBeVisible({
    timeout: 30_000,
  });
  await embedLink.click();
  await expect(previewFrame.locator("h1").first()).toContainText(
    "myprefix t006 --- meadow-flower",
    { timeout: 15_000 },
  );
  await snapshot("standalone excalidraw page rendered with myprefix heading");
  await addKeyFrame(excalidraw);

  const standaloneSvg = previewFrame
    .locator(".meadow-excalidraw-page svg")
    .first();
  await expect(standaloneSvg).toBeVisible({ timeout: 30_000 });

  // The first non-aliased wikilink in the drawing points at
  // `t006 --- linked-from-excalidraw`. After the hook, both the rendered text
  // and the href on the surrounding `<a>` should reflect the prefix.
  const renamedHref =
    "myprefix%20t006%20---%20linked-from-excalidraw.html";
  const renamedLink = previewFrame.locator(
    `.meadow-excalidraw-page svg a[href="${renamedHref}"]`,
  );
  await expect(renamedLink).toHaveCount(1);
  await expect(renamedLink).toContainText(
    "myprefix t006 --- linked-from-excalidraw",
  );
  await snapshot("in-drawing link reflects myprefix in both text and href");
  await addKeyFrame(excalidraw);
  await addKeyFrame(hooks);

  // Sanity: the un-prefixed forms must not appear as link targets in the SVG.
  await expect(
    previewFrame.locator(
      '.meadow-excalidraw-page svg a[href="t006%20---%20linked-from-excalidraw.html"]',
    ),
  ).toHaveCount(0);

  // Following the link should land on the renamed page.
  await renamedLink.click();
  await expect(previewFrame.locator("h1").first()).toContainText(
    "myprefix t006 --- linked-from-excalidraw",
    { timeout: 15_000 },
  );
  await snapshot("navigated to renamed link target page");

  releaseWorkerWarning();
  releaseFontWarning();
  void bigSite;

  await skipMeadowHomeStateCheck();
});
