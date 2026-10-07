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

import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  BundleListPage,
  BundleEditorPage,
  CreateAndEditBundleModal,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { excalidraw, initialPage, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`create a custom bundle with an excalidraw initial page and follow a drawing link`);

const description = linkedScenarioDescription(conceptText`Create a bundle whose starting page is an Excalidraw drawing. Generate its preview and
follow a drawing link to another page.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '05e433b3-03e3-46b3-82c9-99271d27b813' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  // --- Setup ---
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );

  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.expectCalloutVisible("Turn your notes into bundles"));
  await sourceCommand(() => bundleList.clickCreateBundleLink());

  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
  await sourceCommand(() => createModal.fillSourceDirectory(sourceDir));
  await sourceCommand(() => createModal.typeInitialPageTitle("t006 --- meadow-flower"));
  await sourceCommand(() => createModal.selectSuggestion("t006 --- meadow-flower"));
  await sourceCommand(() => createModal.clickCreateBundle());

  await sourceCommand(() => editor.waitForLoad("t006-meadow-flower"));
  await sourceCommand(() => addKeyFrame(initialPage));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("graph view loaded with excalidraw initial page"));

  // --- Test start ---
  // Inspect and preview the drawing.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent(
    "t006 --- meadow-flower",
    "excalidraw",
  ));
  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => editor.clickDeselectSensitivePagesIfVisible());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => editor.clickTrackAll());

  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewCompleteAllTracked());

  await sourceCommand(() => generatedBundle.expectHeading("t006 --- meadow-flower", 30_000));
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingVisible());
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("preview shows excalidraw initial page"));

  // Follow a link inside the drawing.
  const firstDrawingLinkHref =
    "t006%20---%20linked-from-excalidraw.html";
  await sourceCommand(() => generatedBundle.excalidraw.expectStandaloneDrawingLink(
    firstDrawingLinkHref,
  ));
  await sourceCommand(() => generatedBundle.excalidraw.clickStandaloneDrawingLink(firstDrawingLinkHref));

  await sourceCommand(() => generatedBundle.expectHeading("t006 --- linked-from-excalidraw"));
  await sourceCommand(() => addKeyFrame(excalidraw));
  await sourceCommand(() => checkpoint("preview after clicking first excalidraw link"));

  void customBundle;

  releaseWorkerWarning();
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
