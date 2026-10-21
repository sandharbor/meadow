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
import { scenarioSections, excalidraw, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleGeneration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ trackBigBundleExcalidrawPages: true });

/**
 * Verifies that a wikilink inside an Excalidraw drawing whose target page is
 * not whitelisted on the bundle renders as a non-clickable "link not tracked"
 * label, matching the affordance regular pages already use.
 */
const name = linkedScenarioName(conceptText`Excalidraw link to untracked page renders as 'link not tracked'`);

const description = linkedScenarioDescription(conceptText`Leave a drawing's target page untracked and generate the bundle. Its link should explain
that the target is not tracked.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: preview completed.` },
  inspectUntrackedDrawingLink: { type: 'test', text: conceptText`Inspect an untracked drawing link.` },
  untrackedTargetShouldNeverBeWrappedIn: { type: 'test', text: conceptText`The untracked target should never be wrapped in an anchor — the original page-title text is replaced with "link not tracked" before rendering.` },
  replacementTextShowsUpInRenderedSVG: { type: 'test', text: conceptText`The replacement text shows up in the rendered SVG.` },
  finishExpectedWarningCheck: { type: 'test', text: conceptText`Finish the expected-warning check.` },
});
const areas = scenarioAreas([bundleGeneration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'fbc5bf52-5ae6-43d8-8409-d6814ea7dad7' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  const { releaseWorkerWarning, releaseFontWarning, generatedBundle } = await test.step(sections.steps.setup, async () => {
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
    await sourceCommand(() => checkpoint("preview completed"));
    return { releaseWorkerWarning, releaseFontWarning, generatedBundle };
  });

  await test.step(sections.steps.inspectUntrackedDrawingLink, async () => {
    await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
    await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

    await sourceCommand(() => generatedBundle.excalidraw.expectEmbedVisible());
    await sourceCommand(() => generatedBundle.excalidraw.clickEmbed());
    await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower"));

    await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());
  });

  await test.step(sections.steps.untrackedTargetShouldNeverBeWrappedIn, async () => {
    const untrackedHref =
      "page%20linked%20from%20Excalidraw%20that%20is%20not%20tracked.html";
    await sourceCommand(() => generatedBundle.excalidraw.expectNoStandaloneDrawingLink(untrackedHref));
    await sourceCommand(() => generatedBundle.excalidraw.expectNoStandaloneDrawingLinkContaining(
      "not%20tracked",
    ));
  });

  await test.step(sections.steps.replacementTextShowsUpInRenderedSVG, async () => {
    await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingText("link not tracked"));
    await sourceCommand(() => addKeyFrame(excalidraw));
    await sourceCommand(() => checkpoint("excalidraw untracked link rendered as 'link not tracked'"));
  });

  await test.step(sections.steps.finishExpectedWarningCheck, async () => {
    releaseWorkerWarning();
    releaseFontWarning();
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
