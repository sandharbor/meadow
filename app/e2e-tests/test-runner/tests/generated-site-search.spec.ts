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
  GeneratedSite,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Site, Workflows } from "../src/run/workflows.js";
import { customize, search } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("generated site search finds titles and contents, navigates, and can be disabled", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  const generatedSite = modal.generatedSite;
  const customizeTab = new CustomizeTab(page, expect);

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.enableSourcesExport();
  await generatedSite.search.expectSameHeightAsSources();
  await snapshot("generated site search and sources controls align");

  await generatedSite.search.open();
  await generatedSite.search.search("t021");
  await generatedSite.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await addKeyFrame(search);
  await snapshot("generated site title search results");

  await generatedSite.search.clickResult("title", "t021 ---- outlink gap");
  await generatedSite.expectHeading("t021 ---- outlink gap");

  await generatedSite.search.open();
  await generatedSite.search.search("Animated GIF");
  await generatedSite.search.expectContentResult(
    "t006 - embedded media",
    "Animated GIF",
  );
  await snapshot("generated site content search results");

  await generatedSite.search.clickResult("content", "t006 - embedded media");
  await generatedSite.expectHeading("t006 - embedded media");
  await snapshot("navigated from generated site search");

  // The same script-shard loader works when the self-contained HTML is opened
  // directly from disk, without an HTTP server.
  const localPage = await page.context().newPage();
  const localMainPage = path.join(
    testServer.configDir,
    "sites",
    Site.Big,
    "html",
    "preview",
    "main page.html",
  );
  await localPage.goto(pathToFileURL(localMainPage).href);
  const localGeneratedSite = GeneratedSite.onPage(localPage, expect);
  await localGeneratedSite.search.open();
  await localGeneratedSite.search.search("t021");
  await localGeneratedSite.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await localGeneratedSite.close();

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.disableSearch();
  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await generatedSite.search.expectUnavailable();
  await addKeyFrame(customize);
  await snapshot("generated site search disabled");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
