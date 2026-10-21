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
import { scenarioSections, excalidraw, hooks, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleGeneration } from "../../../concepts/index.js";
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

const name = linkedScenarioName(conceptText`Excalidraw embed and in-drawing links pick up page-title hook prefix`);

const description = linkedScenarioDescription(conceptText`Apply a page-title hook and preview an embedded drawing. Both the drawing's link labels
and its targets should reflect the renamed pages.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: preview completed before hook installed.` },
  openPageTitleHook: { type: 'test', text: conceptText`Open the page-title hook.` },
  changeTitlePrefix: { type: 'test', text: conceptText`Change the title prefix.` },
  saveRegeneratePreview: { type: 'test', text: conceptText`Save and regenerate the preview.` },
  inspectRenamedEmbeddingPageCloseFloatingHook: { type: 'test', text: conceptText`Inspect the renamed embedding page. Close the floating hook editor so it stops intercepting clicks on the preview iframe below it.` },
  iframeReRendersNewPrefixWaitFor: { type: 'test', text: conceptText`The iframe re-renders with the new prefix — wait for the main page heading to settle before navigating, otherwise we could click a stale link.` },
  openStandaloneDrawingClickEmbedThumbnailEmbed: { type: 'test', text: conceptText`Open the standalone drawing. Click the embed thumbnail. The embed \`<a>\` href must use the normalized drawing title — otherwise this navigates to a 404 page.` },
  inspectRenamedDrawingLinks: { type: 'test', text: conceptText`Inspect the renamed drawing links.` },
  firstNonAliasedWikilinkInDrawingPoints: { type: 'test', text: conceptText`The first non-aliased wikilink in the drawing points at \`t006 --- linked-from-excalidraw\`. After the hook, both the rendered text and the href on the surrounding \`<a>\` should reflect the prefix.` },
  followRenamedLink: { type: 'test', text: conceptText`Follow the renamed link.` },
  followingLinkShouldLandOnRenamedPage: { type: 'test', text: conceptText`Following the link should land on the renamed page.` },
  finishExpectedWarningCheck: { type: 'test', text: conceptText`Finish the expected-warning check.` },
});
const areas = scenarioAreas([bundleGeneration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '96c282bf-6c94-4f7c-95b7-f70b7af50808' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  const { releaseWorkerWarning, releaseFontWarning, modal, generatedBundle } = await test.step(sections.steps.setup, async () => {
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

    await sourceCommand(() => wf.navigateToBigBundle());
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => checkpoint("preview completed before hook installed"));
    return { releaseWorkerWarning, releaseFontWarning, modal, generatedBundle };
  });

  const { pageTitleHook } = await test.step(sections.steps.openPageTitleHook, async () => {
    await sourceCommand(() => modal.openCustomizeSidebar());
    const customizeTab = new CustomizeTab(page, expect);
    await sourceCommand(() => customizeTab.hooks.switchScopeToGlobal());
    const pageTitleHook = customizeTab.hooks.getHook("Page Title");
    await sourceCommand(() => pageTitleHook.clickEdit());
    await sourceCommand(() => checkpoint("global Page Title editor opened"));
    return { pageTitleHook };
  });

  await test.step(sections.steps.changeTitlePrefix, async () => {
    await sourceCommand(() => pageTitleHook.setContent(PREFIX_HOOK_SOURCE));
    await sourceCommand(() => checkpoint("hook content replaced with myprefix hook"));
  });

  await test.step(sections.steps.saveRegeneratePreview, async () => {
    const previewStreamDone = page.waitForResponse((resp) =>
      resp.url().includes("/preview-stream"),
    );
    await sourceCommand(() => pageTitleHook.save());
    await sourceCommand(() => previewStreamDone);
    await sourceCommand(() => addKeyFrame(hooks));
    await sourceCommand(() => checkpoint("hook saved - preview regenerated"));
  });

  await test.step(sections.steps.inspectRenamedEmbeddingPageCloseFloatingHook, async () => {
    await sourceCommand(() => pageTitleHook.close());
  });

  await test.step(sections.steps.iframeReRendersNewPrefixWaitFor, async () => {
    await sourceCommand(() => modal.expectPreviewIframeHeading("myprefix main page"));

    await sourceCommand(() => generatedBundle.clickPageLink("myprefix t006 - embedded media"));
    await sourceCommand(() => generatedBundle.expectHeading("myprefix t006 - embedded media"));
    await sourceCommand(() => checkpoint("embedding page rendered with myprefix heading"));
  });

  await test.step(sections.steps.openStandaloneDrawingClickEmbedThumbnailEmbed, async () => {
    await sourceCommand(() => generatedBundle.excalidraw.expectEmbedVisible());
    await sourceCommand(() => generatedBundle.excalidraw.clickEmbed());
    await sourceCommand(() => generatedBundle.expectHeading("myprefix t006 --- meadow-flower"));
    await sourceCommand(() => addKeyFrame(excalidraw));
    await sourceCommand(() => checkpoint("standalone excalidraw page rendered with myprefix heading"));
  });

  await test.step(sections.steps.inspectRenamedDrawingLinks, async () => {
    await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());
  });

  const { renamedHref } = await test.step(sections.steps.firstNonAliasedWikilinkInDrawingPoints, async () => {
    const renamedHref =
      "myprefix%20t006%20---%20linked-from-excalidraw.html";
    await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingLink(
      renamedHref,
      "myprefix t006 --- linked-from-excalidraw",
    ));
    await sourceCommand(() => addKeyFrame(excalidraw));
    await sourceCommand(() => addKeyFrame(hooks));
    await sourceCommand(() => checkpoint("in-drawing link reflects myprefix in both text and href"));
    return { renamedHref };
  });

  await test.step(sections.steps.followRenamedLink, async () => {
    await sourceCommand(() => generatedBundle.excalidraw.expectNoStandaloneDrawingLink(
      "t006%20---%20linked-from-excalidraw.html",
    ));
  });

  await test.step(sections.steps.followingLinkShouldLandOnRenamedPage, async () => {
    await sourceCommand(() => generatedBundle.excalidraw.clickStandaloneDrawingLink(renamedHref));
    await sourceCommand(() => generatedBundle.expectHeading(
      "myprefix t006 --- linked-from-excalidraw",
    ));
    await sourceCommand(() => checkpoint("navigated to renamed link target page"));
  });

  await test.step(sections.steps.finishExpectedWarningCheck, async () => {
    releaseWorkerWarning();
    releaseFontWarning();
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
