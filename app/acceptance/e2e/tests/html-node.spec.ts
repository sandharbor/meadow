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
import { htmlNode, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { Fixture } from "../src/run/workflows.js";

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`tracks and browses a native HTML node graph`);

const description = linkedScenarioDescription(conceptText`Track a native HTML page and explore its linked graph. Generate the bundle and verify
that the HTML content is browsable.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '721b46f5-299e-4185-a676-d773b7b95308' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  addKeyFrame,
  skipMeadowHomeStateCheck,
}) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const createModal = new CreateAndEditBundleModal(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  const generatedBundle = previewModal.generatedBundle;

  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => bundleList.clickCreateBundleLink());

  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
  await sourceCommand(() => createModal.fillSourceDirectory(sourceDir));
  await sourceCommand(() => createModal.typeInitialPageTitle("t026 - HTML node"));
  await sourceCommand(() => createModal.selectSuggestion("t026 - HTML node"));
  await sourceCommand(() => createModal.fillDefaultTraversalDepths(3, 0));
  await sourceCommand(() => createModal.clickCreateBundle());

  await sourceCommand(() => editor.waitForLoad("t026-html-node"));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- first HTML page", "html"));
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- second HTML page", "html"));
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared style", "css"));
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared behavior", "js"));
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- shared image", "svg"));
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent("t026 ---- nested markdown", "md"));

  await sourceCommand(() => editor.clickSelectAll());
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => editor.clickDeselectSensitivePagesIfVisible());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => addKeyFrame(htmlNode));
  await sourceCommand(() => checkpoint("HTML node - source graph nodes selected"));

  // --- Test start ---
  // Track and preview the HTML pages.
  await sourceCommand(() => editor.clickTrackAll());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => previewModal.waitForPreviewCompleteAllTracked());

  await sourceCommand(() => generatedBundle.expectHeading("t026 - HTML node", 30_000));
  await sourceCommand(() => generatedBundle.clickPageLink("Open the first HTML page"));
  await sourceCommand(() => generatedBundle.expectHeading("First HTML page"));

  await sourceCommand(() => generatedBundle.expectNativeHtmlCardColor("rgb(251, 249, 255)"));
  await sourceCommand(() => generatedBundle.expectNativeHtmlSharedImageVisible());
  await sourceCommand(() => generatedBundle.expectNativeHtmlSharedScriptLoaded());
  await sourceCommand(() => addKeyFrame(htmlNode));
  await sourceCommand(() => checkpoint("HTML node - first generated page"));

  // Follow the link to the second HTML page.
  await sourceCommand(() => generatedBundle.clickPageLink("Continue to the second HTML page"));
  await sourceCommand(() => generatedBundle.expectHeading("Second HTML page"));
  await sourceCommand(() => generatedBundle.expectNativeHtmlCardColor("rgb(245, 239, 255)"));
  await sourceCommand(() => generatedBundle.expectNativeHtmlSharedScriptLoaded());
  await sourceCommand(() => addKeyFrame(htmlNode));
  await sourceCommand(() => checkpoint("HTML node - second generated page"));

  // Follow the link into Markdown.
  await sourceCommand(() => generatedBundle.clickPageLink("Open the nested Markdown note"));
  await sourceCommand(() => generatedBundle.expectHeading("t026 ---- nested markdown"));
  await sourceCommand(() => addKeyFrame(htmlNode));
  await sourceCommand(() => checkpoint("HTML node - nested Markdown reached from HTML"));

  void customBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
