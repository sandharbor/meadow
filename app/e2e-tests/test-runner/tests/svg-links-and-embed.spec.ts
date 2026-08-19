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
import { svg } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("SVG links work in a directed embed", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await workflows.navigateToBigBundle();
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();

  await generatedBundle.clickPageLink("t006 - embedded media");
  await generatedBundle.expectHeading("t006 - embedded media");

  await generatedBundle.svg.expectOrdinaryImageEmbeds(3);
  await generatedBundle.svg.expectDirectedEmbedVisible();
  await generatedBundle.svg.expectDirectedLink("../main%20page.html");
  await generatedBundle.svg.expectDirectedLink(
    "../t006%20-%20embedded%20media.html",
  );
  await generatedBundle.svg.expectDirectedStandaloneLinkAbsent();
  await snapshot("directed SVG embed rendered with live links");
  await addKeyFrame(svg);

  await generatedBundle.svg.openDirectedFullscreen();
  await snapshot("directed SVG embed fullscreen open");
  await generatedBundle.svg.closeDirectedFullscreen();

  await generatedBundle.svg.clickDirectedLink("../main%20page.html");
  await generatedBundle.expectHeading("main page");
  await snapshot("directed SVG embed link opened target");
  await addKeyFrame(svg);

  void bigBundle;
  await assertMeadowHomeState({
    allowedUntracked: [
      "bundles/meadow-test-bundle-big/build/",
      "bundles/meadow-test-bundle-big/config/generated_bundle_versions.yaml",
      "bundles/meadow-test-bundle-big/html/",
      "bundles/meadow-test-bundle-big/raw/",
    ],
  });
});
