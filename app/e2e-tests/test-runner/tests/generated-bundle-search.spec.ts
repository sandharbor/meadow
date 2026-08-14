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
import { pathToFileURL } from "url";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  ChangesTab,
  CustomizeTab,
  GeneratedBundle,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { customize, search } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("generated bundle search finds titles and contents, navigates, and can be disabled", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundlePreview();
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  const customizeTab = new CustomizeTab(page, expect);

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.enableSourcesExport();
  await generatedBundle.search.expectSameHeightAsSources();
  await snapshot("generated bundle search and sources controls align");

  await generatedBundle.search.open();
  await generatedBundle.search.search("t021");
  await generatedBundle.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await addKeyFrame(search);
  await snapshot("generated bundle title search results");

  await generatedBundle.search.clickResult("title", "t021 ---- outlink gap");
  await generatedBundle.expectHeading("t021 ---- outlink gap");

  await generatedBundle.search.open();
  await generatedBundle.search.search("Animated GIF");
  await generatedBundle.search.expectContentResult(
    "t006 - embedded media",
    "Animated GIF",
  );
  await snapshot("generated bundle content search results");

  await generatedBundle.search.clickResult("content", "t006 - embedded media");
  await generatedBundle.expectHeading("t006 - embedded media");
  await snapshot("navigated from generated bundle search");

  // The same script-shard loader works when the self-contained HTML is opened
  // directly from disk, without an HTTP server.
  const localPage = await page.context().newPage();
  const localMainPage = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Big,
    "html",
    "generated",
    "main page.html",
  );
  await localPage.goto(pathToFileURL(localMainPage).href);
  const localGeneratedBundle = GeneratedBundle.onPage(localPage, expect);
  await localGeneratedBundle.search.open();
  await localGeneratedBundle.search.search("t021");
  await localGeneratedBundle.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await localGeneratedBundle.close();

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.disableSearch();
  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await generatedBundle.search.expectUnavailable();
  await addKeyFrame(customize);
  await snapshot("generated bundle search disabled");
  void bigBundle;

  await skipMeadowHomeStateCheck();
});
