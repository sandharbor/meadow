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
import { excalidraw, initialPage } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.None });

test("create a custom bundle with an excalidraw initial page and follow a drawing link", async ({
  page,
  testServer,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );

  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await bundleList.goto();
  await bundleList.expectCalloutVisible("Turn your notes into bundles");
  await bundleList.clickCreateBundleLink();

  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("t006 --- meadow-flower");
  await createModal.selectSuggestion("t006 --- meadow-flower");
  await createModal.clickCreateBundle();

  await editor.waitForLoad("t006-meadow-flower");
  await snapshot("graph view loaded with excalidraw initial page");
  await addKeyFrame(initialPage);
  await addKeyFrame(excalidraw);

  await editor.switchToListView();
  await editor.expectListViewRowByTitleAndFileTypePresent(
    "t006 --- meadow-flower",
    "excalidraw",
  );
  await editor.clickSelectAll();
  await page.waitForTimeout(500);
  await editor.clickDeselectSensitivePagesIfVisible();
  await page.waitForTimeout(250);
  await editor.clickTrackAll();

  await editor.clickPreview();
  await previewModal.waitForPreviewCompleteAllTracked();

  await generatedBundle.expectHeading("t006 --- meadow-flower", 30_000);
  await generatedBundle.excalidraw.expectStandaloneDrawingVisible();
  await snapshot("preview shows excalidraw initial page");
  await addKeyFrame(excalidraw);

  const firstDrawingLinkHref =
    "t006%20---%20linked-from-excalidraw.html";
  await generatedBundle.excalidraw.expectStandaloneDrawingLink(
    firstDrawingLinkHref,
  );
  await generatedBundle.excalidraw.clickStandaloneDrawingLink(firstDrawingLinkHref);

  await generatedBundle.expectHeading("t006 --- linked-from-excalidraw");
  await snapshot("preview after clicking first excalidraw link");
  await addKeyFrame(excalidraw);

  void customBundle;

  releaseWorkerWarning();
  await skipMeadowHomeStateCheck();
});
