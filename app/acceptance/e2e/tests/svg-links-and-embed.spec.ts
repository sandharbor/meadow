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
import { BundleEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { svg, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`SVG links work in a directed embed`);

const description = linkedScenarioDescription(conceptText`Preview a directed SVG embed, open it fullscreen, and follow one of its links. The
drawing and its link targets should work in the generated bundle.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f414fbce-32af-4a36-a75f-d5c514c9993c' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await sourceCommand(() => workflows.navigateToBigBundle());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewComplete());

  await sourceCommand(() => checkpoint("the generated bundle preview is ready"));

  // --- Test start ---
  // Inspect the directed SVG embed.
  await sourceCommand(() => generatedBundle.clickPageLink("t006 - embedded media"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));

  await sourceCommand(() => generatedBundle.svg.expectOrdinaryImageEmbeds(3));
  await sourceCommand(() => generatedBundle.svg.expectDirectedEmbedVisible());
  const textLink =
    "t006%20---%20page%20that%20embeds%20Excalidraw%20in%20another%20directory.html";
  await sourceCommand(() => generatedBundle.svg.expectDirectedTextLink(
    textLink,
    "t006 --- page that embeds Excalidraw in another directory",
  ));
  await sourceCommand(() => generatedBundle.svg.expectDirectedShapeLink(
    "../t006%20-%20embedded%20media.html",
  ));
  await sourceCommand(() => generatedBundle.svg.expectDirectedStandaloneLinkAbsent());
  await sourceCommand(() => addKeyFrame(svg));
  await sourceCommand(() => checkpoint("directed SVG embed rendered with live links"));

  // Open the SVG fullscreen.
  await sourceCommand(() => generatedBundle.svg.openDirectedFullscreen());
  await sourceCommand(() => checkpoint("directed SVG embed fullscreen open"));

  // Follow an SVG link.
  await sourceCommand(() => generatedBundle.svg.closeDirectedFullscreen());

  await sourceCommand(() => generatedBundle.svg.clickDirectedLink(textLink));
  await sourceCommand(() => generatedBundle.expectHeading(
    "t006 --- page that embeds Excalidraw in another directory",
  ));
  await sourceCommand(() => addKeyFrame(svg));
  await sourceCommand(() => checkpoint("directed SVG embed link opened target"));

  void bigBundle;
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: [
      "bundles/meadow-test-bundle-big/raw/generation_inputs/",
      "bundles/meadow-test-bundle-big/raw/tracked_page_content/",

      "bundles/meadow-test-bundle-big/build/",
      "bundles/meadow-test-bundle-big/config/generated_bundle_versions.yaml",
      "bundles/meadow-test-bundle-big/html/",
      "bundles/meadow-test-bundle-big/raw/",
    ],
  }));
});
