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
import { ChangesTab, CustomizeTab, PreviewPublishModal } from "../src/run/pages/index.js";
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
  const customizeTab = new CustomizeTab(page, expect);

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.enableSourcesExport();
  await modal.expectGeneratedSiteHeaderControlsSameHeight();
  await snapshot("generated site search and sources controls align");

  await modal.openGeneratedSiteSearch();
  await modal.searchGeneratedSite("t021");
  await modal.expectGeneratedSiteTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await addKeyFrame(search);
  await snapshot("generated site title search results");

  await modal.clickGeneratedSiteSearchResult("title", "t021 ---- outlink gap");
  await modal.expectPreviewIframeHeading("t021 ---- outlink gap");

  await modal.openGeneratedSiteSearch();
  await modal.searchGeneratedSite("Animated GIF");
  await modal.expectGeneratedSiteContentResult("t006 - embedded media", "Animated GIF");
  await snapshot("generated site content search results");

  await modal.clickGeneratedSiteSearchResult("content", "t006 - embedded media");
  await modal.expectPreviewIframeHeading("t006 - embedded media");
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
  await localPage.getByRole("button", { name: "Search this site", exact: true }).click();
  await localPage.getByRole("searchbox", { name: "Search this site" }).fill("t021");
  await expect(localPage.locator('[data-search-result-kind="title"] > .meadow-search-result-title')).toHaveText([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]);
  await localPage.close();

  await modal.openCustomizeSidebar();
  await customizeTab.generationOptions.disableSearch();
  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await modal.expectGeneratedSiteSearchUnavailable();
  await addKeyFrame(customize);
  await snapshot("generated site search disabled");
  void bigSite;

  await skipMeadowHomeStateCheck();
});
