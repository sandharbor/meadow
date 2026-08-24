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
  BundleEditorPage,
  BundleListPage,
  CreateAndEditBundleModal,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { customBundle } from "../src/bundle-docs/index.js";
import { htmlNode } from "../src/scenario-docs/index.js";
import { Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.None });

test("tracks and browses a native HTML node graph", async ({
  page,
  testServer,
  snapshot,
  addKeyFrame,
  skipMeadowHomeStateCheck,
}) => {
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await bundleList.goto();
  await bundleList.clickCreateBundleLink();

  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("t026 - HTML node");
  await createModal.selectSuggestion("t026 - HTML node");
  await createModal.fillDefaultTraversalDepths(3, 0);
  await createModal.clickCreateBundle();

  await editor.waitForLoad("t026-html-node");
  await editor.switchToListView();
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- first HTML page", "html");
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- second HTML page", "html");
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared style", "css");
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared behavior", "js");
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared image", "svg");
  await editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- nested markdown", "md");

  await editor.clickSelectAll();
  await page.waitForTimeout(500);
  await editor.clickDeselectSensitivePagesIfVisible();
  await page.waitForTimeout(250);
  await snapshot("HTML node - source graph nodes selected");
  await addKeyFrame(htmlNode);
  await editor.clickTrackAll();
  await editor.clickPreview();
  await previewModal.waitForPreviewCompleteAllTracked();

  await generatedBundle.expectHeading("t026 - HTML node", 30_000);
  await generatedBundle.clickPageLink("Open the first HTML page");
  await generatedBundle.expectHeading("First HTML page");

  await generatedBundle.expectNativeHtmlCardColor("rgb(251, 249, 255)");
  await generatedBundle.expectNativeHtmlSharedImageVisible();
  await generatedBundle.expectNativeHtmlSharedScriptLoaded();
  await snapshot("HTML node - first generated page");
  await addKeyFrame(htmlNode);

  await generatedBundle.clickPageLink("Continue to the second HTML page");
  await generatedBundle.expectHeading("Second HTML page");
  await generatedBundle.expectNativeHtmlCardColor("rgb(245, 239, 255)");
  await generatedBundle.expectNativeHtmlSharedScriptLoaded();
  await snapshot("HTML node - second generated page");
  await addKeyFrame(htmlNode);

  await generatedBundle.clickPageLink("Open the nested Markdown note");
  await generatedBundle.expectHeading("t026 ---- nested markdown");
  await snapshot("HTML node - nested Markdown reached from HTML");
  await addKeyFrame(htmlNode);

  void customBundle;
  await skipMeadowHomeStateCheck();
});
